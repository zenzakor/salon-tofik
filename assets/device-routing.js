/*
 * Routes visitors between the desktop domain and the m. subdomain.
 * GitHub Pages cannot use https://m.username.github.io safely, so it
 * automatically falls back to same-host mobile mode with ?view=mobile.
 * Optional production override:
 * window.SALON_DEVICE_ROUTING_CONFIG = {
 *   mainHost: "mydomain.com",
 *   mobileHost: "m.mydomain.com",
 *   cookieDomain: ".mydomain.com",
 *   sameHostMobile: false
 * };
 */
(function () {
    "use strict";

    var CONFIG = window.SALON_DEVICE_ROUTING_CONFIG || {};
    var COOKIE_NAME = "salon_device_view";
    var STORAGE_KEY = "salonDeviceView";
    var COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
    var ROUTING_PARAMS = ["view", "device", "forceView"];
    var MOBILE_MEDIA = "only screen and (max-width: 767px)";
    var MULTIPART_PUBLIC_SUFFIXES = [
        "co.il", "org.il", "net.il", "ac.il", "gov.il", "muni.il",
        "co.uk", "org.uk", "com.au", "com.br", "com.tr"
    ];

    function normalizeHost(hostname) {
        return String(hostname || "").toLowerCase().replace(/\.$/, "");
    }

    function isIpAddress(hostname) {
        return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.indexOf(":") !== -1;
    }

    function isLocalHost(hostname) {
        return !hostname ||
            hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname === "::1" ||
            hostname.endsWith(".local");
    }

    function getGitHubPagesHost(hostname) {
        if (/^m\.[^.]+\.github\.io$/.test(hostname)) {
            return hostname.slice(2);
        }

        if (/^[^.]+\.github\.io$/.test(hostname)) {
            return hostname;
        }

        return null;
    }

    function shouldUseSameHostMobile(hostname) {
        if (typeof CONFIG.sameHostMobile === "boolean") {
            return CONFIG.sameHostMobile;
        }

        return Boolean(getGitHubPagesHost(hostname));
    }

    function getHosts() {
        var currentHost = normalizeHost(window.location.hostname);
        var configuredMain = normalizeHost(CONFIG.mainHost);
        var configuredMobile = normalizeHost(CONFIG.mobileHost);
        var githubPagesHost = getGitHubPagesHost(currentHost);

        if (shouldUseSameHostMobile(currentHost)) {
            var sameHostMain = configuredMain || githubPagesHost || currentHost.replace(/^m\./, "");

            return {
                main: sameHostMain,
                mobile: sameHostMain,
                current: currentHost,
                isMobileHost: false,
                sameHostMobile: true
            };
        }

        if (configuredMain && configuredMobile) {
            return {
                main: configuredMain,
                mobile: configuredMobile,
                current: currentHost,
                isMobileHost: currentHost === configuredMobile,
                sameHostMobile: false
            };
        }

        if (currentHost.indexOf("m.") === 0) {
            return {
                main: currentHost.slice(2),
                mobile: currentHost,
                current: currentHost,
                isMobileHost: true,
                sameHostMobile: false
            };
        }

        return {
            main: currentHost,
            mobile: "m." + currentHost.replace(/^www\./, ""),
            current: currentHost,
            isMobileHost: false,
            sameHostMobile: false
        };
    }

    function normalizeView(value) {
        var view = String(value || "").toLowerCase();

        if (view === "desktop" || view === "main" || view === "full") {
            return "desktop";
        }

        if (view === "mobile" || view === "m") {
            return "mobile";
        }

        return null;
    }

    function getUrlChoice() {
        var params = new URLSearchParams(window.location.search);
        var choice = null;

        ROUTING_PARAMS.some(function (param) {
            choice = normalizeView(params.get(param));
            return Boolean(choice);
        });

        return choice;
    }

    function removeRoutingParamsFromAddressBar() {
        if (!window.history || !window.history.replaceState) {
            return;
        }

        var url = new URL(window.location.href);
        var changed = false;

        ROUTING_PARAMS.forEach(function (param) {
            if (url.searchParams.has(param)) {
                url.searchParams.delete(param);
                changed = true;
            }
        });

        if (changed) {
            window.history.replaceState(window.history.state, document.title, url.toString());
        }
    }

    function getCookieDomain(hostname) {
        if (CONFIG.cookieDomain) {
            return CONFIG.cookieDomain;
        }

        hostname = normalizeHost(hostname);

        if (isLocalHost(hostname) || isIpAddress(hostname)) {
            return "";
        }

        var parts = hostname.split(".");

        if (parts.length <= 2) {
            return "." + hostname;
        }

        var lastTwoParts = parts.slice(-2).join(".");

        if (MULTIPART_PUBLIC_SUFFIXES.indexOf(lastTwoParts) !== -1 && parts.length >= 3) {
            return "." + parts.slice(-3).join(".");
        }

        return "." + parts.slice(-2).join(".");
    }

    function setCookie(view) {
        var encoded = encodeURIComponent(view);
        var secure = window.location.protocol === "https:" ? "; Secure" : "";
        var baseCookie = COOKIE_NAME + "=" + encoded + "; Max-Age=" + COOKIE_MAX_AGE + "; Path=/; SameSite=Lax" + secure;
        var cookieDomain = getCookieDomain(window.location.hostname);

        if (cookieDomain) {
            document.cookie = baseCookie + "; Domain=" + cookieDomain;
        }

        document.cookie = baseCookie;
    }

    function getCookie() {
        var cookies = document.cookie ? document.cookie.split(";") : [];

        for (var i = 0; i < cookies.length; i += 1) {
            var parts = cookies[i].trim().split("=");
            var name = parts.shift();

            if (name === COOKIE_NAME) {
                return normalizeView(decodeURIComponent(parts.join("=")));
            }
        }

        return null;
    }

    function setStoredPreference(view) {
        try {
            window.localStorage.setItem(STORAGE_KEY, view);
        } catch (error) {
            // Some privacy modes block localStorage; the cookie still carries the preference.
        }

        setCookie(view);
    }

    function getStoredPreference() {
        var cookieChoice = getCookie();

        if (cookieChoice) {
            return cookieChoice;
        }

        try {
            return normalizeView(window.localStorage.getItem(STORAGE_KEY));
        } catch (error) {
            return null;
        }
    }

    function getLocalStorageValue(key, fallback) {
        try {
            return window.localStorage.getItem(key) || fallback;
        } catch (error) {
            return fallback;
        }
    }

    function applySavedShellPreferences() {
        var theme = getLocalStorageValue("salonTheme", "light");
        var lang = getLocalStorageValue("salonLang", "ar");
        var textSize = getLocalStorageValue("salonTextSize", "normal");

        document.documentElement.lang = lang;
        document.documentElement.dir = lang === "en" ? "ltr" : "rtl";

        function applyBodyPreferences() {
            if (!document.body) {
                return;
            }

            document.body.classList.toggle("dark-mode", theme === "dark");
            document.body.style.fontSize = textSize === "large" ? "18px" : "";
        }

        if (document.body) {
            applyBodyPreferences();
        } else {
            document.addEventListener("DOMContentLoaded", applyBodyPreferences, { once: true });
        }
    }

    function isMobileDevice() {
        if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean") {
            return navigator.userAgentData.mobile;
        }

        var userAgent = navigator.userAgent || "";
        var mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobi/i.test(userAgent);
        var coarseSmallScreen = window.matchMedia &&
            window.matchMedia("(pointer: coarse)").matches &&
            window.matchMedia("(max-width: 900px)").matches;

        return mobileUserAgent || coarseSmallScreen;
    }

    function cleanRoutingParams(url) {
        ROUTING_PARAMS.forEach(function (param) {
            url.searchParams.delete(param);
        });
    }

    function buildUrl(hostname, options) {
        var url = new URL(window.location.href);
        var targetHost = normalizeHost(hostname);

        options = options || {};
        url.hostname = targetHost;

        if (CONFIG.protocol) {
            url.protocol = CONFIG.protocol;
        }

        if (window.location.port && !isLocalHost(targetHost) && !CONFIG.keepPort) {
            url.port = "";
        }

        cleanRoutingParams(url);

        if (options.view) {
            url.searchParams.set("view", options.view);
        }

        if (options.dropHash) {
            url.hash = "";
        }

        return url.toString();
    }

    function getUrlForView(view, includeViewParam) {
        var hosts = getHosts();
        var targetHost = view === "mobile" ? hosts.mobile : hosts.main;
        var shouldIncludeViewParam = includeViewParam || hosts.sameHostMobile;

        if (isLocalHost(hosts.current)) {
            targetHost = hosts.current;
        }

        return buildUrl(targetHost, { view: shouldIncludeViewParam ? view : null });
    }

    function getEffectiveView(preferredView) {
        var hosts = getHosts();

        if (preferredView) {
            return preferredView;
        }

        if (hosts.isMobileHost) {
            return "mobile";
        }

        return isMobileDevice() ? "mobile" : "desktop";
    }

    function setDocumentView(view) {
        var root = document.documentElement;
        var normalizedView = normalizeView(view) || "desktop";

        root.classList.remove("mobile-view", "desktop-view");
        root.classList.add(normalizedView + "-view");
        root.setAttribute("data-device-view", normalizedView);
    }

    function redirectIfNeeded(preferredView, passPreferenceToTarget) {
        var hosts = getHosts();

        if (isLocalHost(hosts.current) || hosts.sameHostMobile) {
            return false;
        }

        var currentView = hosts.isMobileHost ? "mobile" : "desktop";
        var targetView = getEffectiveView(preferredView);

        if (targetView !== currentView) {
            window.location.replace(getUrlForView(targetView, passPreferenceToTarget));
            return true;
        }

        return false;
    }

    function upsertLink(rel, href, media) {
        var selector = 'link[rel="' + rel + '"]';

        if (media) {
            selector += '[media="' + media + '"]';
        }

        var link = document.head.querySelector(selector);

        if (!link) {
            link = document.createElement("link");
            link.setAttribute("rel", rel);

            if (media) {
                link.setAttribute("media", media);
            }

            document.head.appendChild(link);
        }

        link.setAttribute("href", href);
    }

    function removeLink(rel, media) {
        var selector = 'link[rel="' + rel + '"]';

        if (media) {
            selector += '[media="' + media + '"]';
        }

        var link = document.head.querySelector(selector);

        if (link) {
            link.remove();
        }
    }

    function applySeoLinks() {
        var hosts = getHosts();

        if (isLocalHost(hosts.current)) {
            return;
        }

        upsertLink("canonical", buildUrl(hosts.main, { dropHash: true }));

        if (hosts.sameHostMobile) {
            removeLink("alternate", MOBILE_MEDIA);
            return;
        }

        upsertLink("alternate", buildUrl(hosts.mobile, { dropHash: true }), MOBILE_MEDIA);
    }

    function insertFooterSwitchStyle() {
        if (document.getElementById("device-switch-style")) {
            return;
        }

        var style = document.createElement("style");
        style.id = "device-switch-style";
        style.textContent = [
            ".footer-version-switch { display: inline-flex; align-items: center; gap: 8px; margin-inline-start: 10px; direction: ltr; }",
            ".footer-version-switch a { color: #fff; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }",
            ".footer-version-switch a:hover, .footer-version-switch a:focus { color: #d8d8d8; }"
        ].join("");
        document.head.appendChild(style);
    }

    function setupSwitchLinks() {
        var links = document.querySelectorAll("[data-device-switch]");

        if (!links.length) {
            return;
        }

        insertFooterSwitchStyle();

        var targetView = getEffectiveView(getUrlChoice() || getStoredPreference()) === "mobile" ? "desktop" : "mobile";
        var label = targetView === "mobile" ? "Mobile Version" : "Desktop Version";
        var href = getUrlForView(targetView, true);

        links.forEach(function (link) {
            link.textContent = label;
            link.setAttribute("href", href);
            link.addEventListener("click", function (event) {
                event.preventDefault();
                setStoredPreference(targetView);
                window.location.assign(href);
            });
        });
    }

    function init() {
        var urlChoice = getUrlChoice();
        var storedPreference = getStoredPreference();
        var preferredView = urlChoice || storedPreference;
        var activeView = getEffectiveView(preferredView);
        var didRedirect;

        applySavedShellPreferences();
        applySeoLinks();

        if (urlChoice) {
            setStoredPreference(urlChoice);
        }

        setDocumentView(activeView);
        didRedirect = redirectIfNeeded(preferredView, Boolean(preferredView));

        if (urlChoice && !didRedirect) {
            removeRoutingParamsFromAddressBar();
        }

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", setupSwitchLinks);
        } else {
            setupSwitchLinks();
        }
    }

    window.SalonDeviceRouting = {
        switchTo: function (view) {
            var normalizedView = normalizeView(view);

            if (!normalizedView) {
                return;
            }

            setStoredPreference(normalizedView);
            setDocumentView(normalizedView);
            window.location.assign(getUrlForView(normalizedView, true));
        },
        getPreference: getStoredPreference,
        getDesktopUrl: function () {
            return getUrlForView("desktop", false);
        },
        getMobileUrl: function () {
            return getUrlForView("mobile", false);
        }
    };

    init();
}());
