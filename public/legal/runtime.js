(function () {
  if (typeof window === "undefined") return;
  if (window.__W2B_LEGAL_RUNTIME_BOOTED) return;
  window.__W2B_LEGAL_RUNTIME_BOOTED = true;

  var DEFAULT_CONFIG = {
    privacyUrl: "https://www.iubenda.com/privacy-policy/93638969",
    cookieUrl: "https://www.iubenda.com/privacy-policy/93638969/cookie-policy",
    contactEmail: "privacy@where2beach.com",
    iubenda: {
      siteId: null,
      cookiePolicyId: null,
      lang: "it",
      autoBlocking: true,
    },
  };
  var LEGACY_IUBENDA_POLICY_IDS = {
    "89523138": true,
  };

  var KEY_TO_CONFIG = {
    privacy: "privacyUrl",
    cookie: "cookieUrl",
  };

  function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function toNonEmptyString(value) {
    if (typeof value !== "string") return null;
    var trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function toPositiveInt(value) {
    var asNumber = Number.parseInt(String(value || ""), 10);
    if (!Number.isFinite(asNumber) || asNumber <= 0) return null;
    return asNumber;
  }

  function toBoolean(value, fallback) {
    if (typeof value === "boolean") return value;
    var raw = toNonEmptyString(value);
    if (!raw) return fallback;
    var normalized = raw.toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
    if (normalized === "0" || normalized === "false" || normalized === "no") return false;
    return fallback;
  }

  function isNativeShellContext() {
    if (window.__W2B_NATIVE_SHELL === true) return true;

    try {
      var pathname = (window.location.pathname || "").replace(/\/+$/, "") || "/";
      if (
        pathname === "/app" ||
        pathname.indexOf("/app/") === 0 ||
        pathname === "/register" ||
        pathname.indexOf("/app/register") === 0
      ) {
        return true;
      }
      var params = new URLSearchParams(window.location.search || "");
      var nativeShell = toNonEmptyString(params.get("native_shell"));
      if (nativeShell && (nativeShell === "1" || nativeShell.toLowerCase() === "true")) {
        return true;
      }
      var from = toNonEmptyString(params.get("from"));
      return !!from && from.toLowerCase() === "app";
    } catch {
      return false;
    }
  }

  function isExternalUrl(rawUrl) {
    try {
      var parsed = new URL(rawUrl, window.location.origin);
      return parsed.origin !== window.location.origin;
    } catch {
      return false;
    }
  }

  function isLegacyIubendaUrl(rawUrl) {
    try {
      var parsed = new URL(rawUrl, window.location.origin);
      var host = (parsed.hostname || "").toLowerCase();
      if (host !== "iubenda.com" && !host.endsWith(".iubenda.com")) return false;
      var match = parsed.pathname.match(/\/privacy-policy\/(\d+)(?:\/|$)/);
      if (!match) return false;
      return LEGACY_IUBENDA_POLICY_IDS[match[1]] === true;
    } catch {
      return false;
    }
  }

  function normalizePathUrl(rawUrl, fallback) {
    var value = toNonEmptyString(rawUrl);
    if (!value) return fallback;

    if (value.charAt(0) === "/") {
      try {
        var parsedInternal = new URL(value, window.location.origin);
        parsedInternal.pathname = (parsedInternal.pathname.replace(/\/+$/, "") || "") + "/";
        return parsedInternal.pathname + parsedInternal.search + parsedInternal.hash;
      } catch {
        return fallback;
      }
    }

    try {
      var parsed = new URL(value);
      if (isLegacyIubendaUrl(parsed.toString())) return fallback;
      return parsed.toString();
    } catch {
      return fallback;
    }
  }

  function normalizeEmail(rawEmail, fallback) {
    var value = toNonEmptyString(rawEmail);
    if (!value) return fallback;
    var normalized = value.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return fallback;
    return normalized;
  }

  function mergeConfig(baseConfig, incomingConfig) {
    if (!isRecord(incomingConfig)) return baseConfig;

    var mergedIubenda = Object.assign({}, baseConfig.iubenda);
    if (isRecord(incomingConfig.iubenda)) {
      mergedIubenda.siteId =
        toPositiveInt(incomingConfig.iubenda.siteId) ?? mergedIubenda.siteId;
      mergedIubenda.cookiePolicyId =
        toPositiveInt(incomingConfig.iubenda.cookiePolicyId) ?? mergedIubenda.cookiePolicyId;
      mergedIubenda.lang =
        toNonEmptyString(incomingConfig.iubenda.lang) || mergedIubenda.lang;
      mergedIubenda.autoBlocking =
        toBoolean(incomingConfig.iubenda.autoBlocking, mergedIubenda.autoBlocking);
    }

    return {
      privacyUrl: normalizePathUrl(incomingConfig.privacyUrl, baseConfig.privacyUrl),
      cookieUrl: normalizePathUrl(incomingConfig.cookieUrl, baseConfig.cookieUrl),
      contactEmail: normalizeEmail(incomingConfig.contactEmail, baseConfig.contactEmail),
      iubenda: mergedIubenda,
    };
  }

  function setLinkHref(anchor, href) {
    anchor.setAttribute("href", href);

    if (isExternalUrl(href)) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
      return;
    }

    anchor.removeAttribute("target");
    anchor.removeAttribute("rel");
  }

  function applyLegalLinks(config) {
    var anchors = document.querySelectorAll("[data-legal-link]");
    anchors.forEach(function (anchor) {
      var key = anchor.getAttribute("data-legal-link");
      if (!key) return;
      var configKey = KEY_TO_CONFIG[key];
      if (!configKey) return;
      var targetUrl = config[configKey];
      if (!targetUrl) return;
      setLinkHref(anchor, targetUrl);
    });
  }

  function applyContactEmail(config) {
    var nodes = document.querySelectorAll("[data-legal-contact]");
    nodes.forEach(function (node) {
      if (node.tagName === "A") {
        node.setAttribute("href", "mailto:" + config.contactEmail);
      }
      if (node.hasAttribute("data-legal-contact-text") || node.tagName === "A") {
        node.textContent = config.contactEmail;
      }
    });
  }

  function addScript(id, src, isAsync) {
    if (document.getElementById(id)) return;
    var script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.type = "text/javascript";
    if (isAsync) script.async = true;
    document.head.appendChild(script);
  }

  function hasIubendaWidget() {
    return !!document.querySelector('script[src*="embeds.iubenda.com/widgets/"]');
  }

  function initIubenda(config) {
    if (isNativeShellContext()) return;
    // The landing ships iubenda's all-in-one widget, which already installs the
    // cookie solution: loading a second one here doubled the scripts and the
    // consent setup (and pulled an autoblocking script the account doesn't use).
    if (hasIubendaWidget()) return;

    var iubendaConfig = config.iubenda;
    if (!iubendaConfig) return;
    if (!iubendaConfig.siteId || !iubendaConfig.cookiePolicyId) return;

    window._iub = window._iub || [];
    window._iub.csConfiguration = {
      siteId: iubendaConfig.siteId,
      cookiePolicyId: iubendaConfig.cookiePolicyId,
      lang: iubendaConfig.lang || "it",
      storage: {
        useSiteId: true,
      },
    };

    if (iubendaConfig.autoBlocking) {
      addScript(
        "w2b-iubenda-autoblocking",
        "https://cs.iubenda.com/autoblocking/" + String(iubendaConfig.siteId) + ".js",
        false,
      );
    }

    addScript(
      "w2b-iubenda-cs",
      "https://cdn.iubenda.com/cs/stable/iubenda_cs.js",
      true,
    );
  }

  function openCookiePreferences() {
    var api = window._iub && window._iub.cs && window._iub.cs.api;
    if (!api || typeof api.openPreferences !== "function") return false;
    api.openPreferences();
    return true;
  }

  function installPreferencesAction() {
    document.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || typeof target.closest !== "function") return;
      var trigger = target.closest("[data-legal-open-preferences]");
      if (!trigger) return;

      event.preventDefault();
      if (!openCookiePreferences()) {
        var fallback = window.W2B_LEGAL_CONFIG && window.W2B_LEGAL_CONFIG.cookieUrl;
        if (!fallback) return;
        window.location.assign(fallback);
      }
    });
  }

  function emitReady(config) {
    window.dispatchEvent(
      new CustomEvent("w2b:legal-config-ready", {
        detail: config,
      }),
    );
  }

  async function readRemoteConfig() {
    try {
      var response = await fetch("/api/legal-config", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
      if (!response.ok) return null;
      var body = await response.json();
      if (!body || body.ok !== true || !isRecord(body.config)) return null;
      return body.config;
    } catch {
      return null;
    }
  }

  function finalize(config) {
    window.W2B_LEGAL_CONFIG = config;
    window.W2B_LEGAL = {
      openCookiePreferences: openCookiePreferences,
    };

    applyLegalLinks(config);
    applyContactEmail(config);
    initIubenda(config);
    emitReady(config);
  }

  installPreferencesAction();

  var config = mergeConfig(DEFAULT_CONFIG, window.W2B_LEGAL_CONFIG);

  void readRemoteConfig().then(function (remoteConfig) {
    if (remoteConfig) {
      config = mergeConfig(config, remoteConfig);
    }
    finalize(config);
  });
})();
