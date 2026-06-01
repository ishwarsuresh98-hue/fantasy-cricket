import UIKit
import Capacitor
import WebKit

/// Custom bridge view controller that keeps external links inside the WKWebView.
/// Prevents target="_blank" links from bouncing out to Safari while leaving
/// Capacitor's own navigation handling fully intact.
class ViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()

        // Disable 3D-touch / long-press link preview — it can hand off to Safari
        webView?.allowsLinkPreview = false
    }

    // MARK: – Navigation policy

    /// Only intercepts target="_blank" navigations to external http/https URLs.
    /// Everything else — including Capacitor internals, the app domain, Supabase,
    /// and any same-frame navigation — is passed to super so Capacitor's bridge
    /// handling runs normally and the initial page load is never blocked.
    override func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        // Only act on new-window / target="_blank" navigations (targetFrame == nil)
        // that point to external http/https URLs.
        if navigationAction.targetFrame == nil,
           let url = navigationAction.request.url,
           let scheme = url.scheme?.lowercased(),
           (scheme == "https" || scheme == "http"),
           let host = url.host?.lowercased(),
           !host.hasSuffix("the-xi.app"),
           !host.hasSuffix("supabase.co"),
           host != "localhost" {
            // Load within the WebView instead of handing off to Safari
            webView.load(navigationAction.request)
            decisionHandler(.cancel)
            return
        }

        // Let Capacitor's bridge handle everything else — this is critical for
        // the initial page load, deep links, and auth callbacks.
        super.webView(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
    }
}
