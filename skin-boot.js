// Before the first paint: the saved look on <html> ("ink" unless he chose Classic in Settings), so the other look
// never flashes. A classic script on purpose (it must run before the page draws); skin-rules.js holds the same rule.
(function () {
  var v = "ink";
  try { var s = JSON.parse(localStorage.getItem("mkl.skin")); if (s === "classic" || s === "ink") v = s; } catch (e) { /* private mode */ }
  var h = document.documentElement;
  h.setAttribute("data-skin", v);
  if (v === "ink") {
    h.setAttribute("data-vk", "");
    var m = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < m.length; i++) { m[i].setAttribute("data-classic", m[i].content); m[i].content = "#000000"; }
  }
})();
