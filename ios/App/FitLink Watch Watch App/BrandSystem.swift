import SwiftUI

extension Color {
    static let brandViolet = Color(red: 0.545, green: 0.247, blue: 0.878)
    static let brandIndigo = Color(red: 0.388, green: 0.278, blue: 0.910)
    static let brandMagenta = Color(red: 0.878, green: 0.310, blue: 0.718)
    
    static let brandSuccess = Color(red: 0.227, green: 0.625, blue: 0.471)
    static let brandWarning = Color(red: 0.976, green: 0.580, blue: 0.024)
    static let brandDestructive = Color(red: 0.871, green: 0.255, blue: 0.255)
    
    static let surfaceCard = Color(red: 0.094, green: 0.094, blue: 0.118)
    static let hairline = Color.white.opacity(0.08)
    static let textMuted = Color(red: 0.65, green: 0.65, blue: 0.70)
}

extension LinearGradient {
    static let brandGradient = LinearGradient(
        stops: [
            .init(color: .brandViolet, location: 0.0),
            .init(color: .brandIndigo, location: 0.55),
            .init(color: .brandMagenta, location: 1.0)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    
    static let trainerGradient = LinearGradient(
        colors: [.brandViolet, .brandIndigo],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}
