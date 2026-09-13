// 首帧前落定主题：晚一步就会先闪一下深色。默认深色（产品基调），只认用户显式选择，不跟随系统。
// 这里是普通脚本（非 module）且在 head 中阻塞加载，因此在 body 渲染前就已执行。
(function () {
  var theme = "dark";
  try {
    var saved = localStorage.getItem("axiom.theme");
    if (saved === "light" || saved === "dark") theme = saved;
  } catch {}
  document.documentElement.dataset.theme = theme;
})();
