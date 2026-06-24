//
//  LiveActivityImageCache.swift
//  App
//
//  Skida thumbnail vezbe i kesira ga u App Group da ga Live Activity ekstenzija
//  procita. Slika se smanji na max 120x120 (memorijski limit LA ekstenzije) i snimi
//  kao PNG. Putanja/ime fajla dolaze iz deljenih helpera u
//  FitLinkLiveActivityAttributes.swift (clan oba targeta).
//

import Foundation
import UIKit

enum LiveActivityImageCache {

    static func fileName(for url: String) -> String {
        liveActivityThumbFileName(forURL: url)
    }

    static func cachedPath(for url: String) -> URL? {
        liveActivityThumbURL(fileName: fileName(for: url))
    }

    static func isCached(_ url: String) -> Bool {
        guard let path = cachedPath(for: url) else { return false }
        return FileManager.default.fileExists(atPath: path.path)
    }

    // Vrati fileName (za ContentState.imageFileName) ili nil na gresku. Sve off-main,
    // completion uvek na main.
    static func download(_ url: String, completion: @escaping (String?) -> Void) {
        let name = fileName(for: url)

        // Vec kesirano -> odmah.
        if isCached(url) {
            DispatchQueue.main.async { completion(name) }
            return
        }
        guard let remote = URL(string: url), let dest = cachedPath(for: url) else {
            DispatchQueue.main.async { completion(nil) }
            return
        }

        URLSession.shared.dataTask(with: remote) { data, _, _ in
            // UIImage(data:) dekodira i webp na iOS 14+.
            guard let data, let image = UIImage(data: data) else {
                DispatchQueue.main.async { completion(nil) }
                return
            }
            let resized = LiveActivityImageCache.resize(image, maxSide: 120)
            guard let png = resized.pngData() else {
                DispatchQueue.main.async { completion(nil) }
                return
            }
            do {
                try png.write(to: dest, options: .atomic)
                DispatchQueue.main.async { completion(name) }
            } catch {
                DispatchQueue.main.async { completion(nil) }
            }
        }.resume()
    }

    // AspectFit u maxSide x maxSide; ne uvecava preko originala. 1x px (mala slika).
    private static func resize(_ image: UIImage, maxSide: CGFloat) -> UIImage {
        let w = image.size.width, h = image.size.height
        guard w > 0, h > 0 else { return image }
        let scale = min(maxSide / w, maxSide / h)
        if scale >= 1 { return image }
        let newSize = CGSize(width: floor(w * scale), height: floor(h * scale))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: newSize, format: format)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}
