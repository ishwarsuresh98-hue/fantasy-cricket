import UIKit
import Capacitor
import WebKit

/// Custom bridge view controller that keeps all navigation inside the WKWebView.
/// Prevents target="_blank" links and external URLs from bouncing out to Safari.
class ViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()

        // Disable 3D-touch / long-press link preview — it can hand off to Safari
        webView?.allowsLinkPreview = false
    }

    // MARK: – Navigation policy

    /// Intercept every navigation decision so no link escapes to an external browser.
    override func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        let scheme = url.scheme?.lowercased() ?? ""
        let host   = url.host?.lowercased()   ?? ""

        // Always allow Capacitor internals, blob URLs, and the app's own domain
        let isInternal = ["capacitor", "ionic", "about", "blob"].contains(scheme)
                      || host.hasSuffix("the-xi.app")
                      || host == "localhost"

        if isInternal {
            decisionHandler(.allow)
            return
        }

        // target="_blank" has a nil targetFrame — load within the WebView instead
        // of letting UIKit hand it off to Safari
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
            decisionHandler(.cancel)
            return
        }

        // Allow all other navigation (relative paths, Supabase auth callbacks, etc.)
        decisionHandler(.allow)
    }
}
