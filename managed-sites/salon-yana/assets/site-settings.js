(function () {
  function normalizePath(value) {
    return String(value || "").trim();
  }

  function replaceText(root, settings) {
    if (!settings.siteName) return;
    var replacements = [
      ["Salon Tofik", settings.siteName],
      ["SALON TOFIK", settings.siteName.toUpperCase()],
      ["TOFIK ZAKOR", settings.siteName],
      ["صالون توفيق", settings.siteName],
      ["صالون توفيق", settings.siteName]
    ];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var nextValue = node.nodeValue;
      replacements.forEach(function (pair) {
        nextValue = nextValue.split(pair[0]).join(pair[1]);
      });
      if (nextValue !== node.nodeValue) node.nodeValue = nextValue;
    }
  }

  function applySettings(settings) {
    var siteName = normalizePath(settings.siteName);
    var phone = normalizePath(settings.phone);
    var whiteLogo = normalizePath(settings.whiteLogo);
    var blackLogo = normalizePath(settings.blackLogo);

    if (siteName) {
      document.title = document.title
        .replace(/Salon Tofik/gi, siteName)
        .replace(/TOFIK ZAKOR/gi, siteName)
        .replace(/صالون توفيق/g, siteName)
        .replace(/صالون توفيق/g, siteName);
      replaceText(document.body, settings);
      document.querySelectorAll("img[alt]").forEach(function (image) {
        var alt = image.getAttribute("alt") || "";
        if (/tofik|صالون/i.test(alt)) image.setAttribute("alt", siteName);
      });
    }

    document.querySelectorAll("img").forEach(function (image) {
      var src = image.getAttribute("src") || "";
      if (whiteLogo && src.indexOf("logo-white") !== -1) image.setAttribute("src", whiteLogo);
      if (blackLogo && src.indexOf("logo-black") !== -1) image.setAttribute("src", blackLogo);
    });

    if (phone) {
      document.querySelectorAll('a[href^="tel:"]').forEach(function (link) {
        link.setAttribute("href", "tel:" + phone.replace(/[^+0-9]/g, ""));
        if (!link.textContent.trim()) link.textContent = phone;
      });
      document.querySelectorAll("[data-site-phone]").forEach(function (node) {
        node.textContent = phone;
      });
    }
  }

  fetch("site-settings.json", { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error("settings_not_found");
      return response.json();
    })
    .then(applySettings)
    .catch(function () {});
})();