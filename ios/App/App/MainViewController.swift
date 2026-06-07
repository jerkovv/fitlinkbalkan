import UIKit
import Capacitor

// Root view controller for the Capacitor bridge.
//
// Jedina svrha: ukinuti rubber-band overscroll (bounce) WKWebView-a, da
// povlacenje preko vrha/dna ne otkriva praznu belu pozadinu. Skrol se i dalje
// desava unutar .phone-shell kontejnera u web sloju; ovde samo gasimo native
// bounce na scrollView-u koji omotava ceo WebView.
class MainViewController: CAPBridgeViewController {

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        disableWebViewBounce()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // capacitorDidLoad() je glavno mesto, ali postavljamo i ovde za slucaj
        // da je webView vec instanciran (defense-in-depth, idempotentno).
        disableWebViewBounce()
    }

    private func disableWebViewBounce() {
        guard let scrollView = webView?.scrollView else { return }
        scrollView.bounces = false
        scrollView.alwaysBounceVertical = false
        scrollView.alwaysBounceHorizontal = false
    }
}
