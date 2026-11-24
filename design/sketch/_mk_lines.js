/* throwaway: print ready-to-paste harness array lines for polaroid fixture */
function esc(s) {
  return Array.from(s).map(function (c) {
    var n = c.codePointAt(0);
    return n > 127 ? '\\u' + n.toString(16).toUpperCase().padStart(4, '0') : c;
  }).join('');
}
function line(varName, arr) {
  return '        var ' + varName + '=[' + arr.map(function (x) { return '"' + esc(x) + '"'; }).join(',') + '];';
}
var pcaps = ['秋叶小径','临湖晨读','后山晚云','银杏大道','图书馆暮色','操场晚风','校门晨光','实验楼窗台'];
var ff = ['21级临床','22级药学','大一新生','图书馆常客','匿名同学'];
var fk = ['优化建议','问题反馈','优化建议','吐槽','感谢'];
var ft = ['课表能不能加个周数切换，一目了然','教务登录有时候会超时，多点几次才好','希望 WIKI 能多放点校园照片','食堂人流能不能也做个提示','WIKI 照片墙这个横滑挺好看的，赞。'];
var frp = ['已记录，下个版本排上','已修复超时重试','欢迎投稿校园实景','收到，会考虑','谢谢，多提意见'];
var hints = {
  hintPh: '这些是同学自己拍的。上传后要管理员审核通过才会公开，只放校园实景，别放人脸和宿舍内部。',
  hintFb: '想加功能、发现 bug、资料有错，都可以在这里说，不用加群。管理员回复后会显示在下面。',
  adminReply: '管理员回复'
};
console.log(line('pcaps', pcaps));
console.log(line('ff', ff));
console.log(line('fk', fk));
console.log(line('ft', ft));
console.log(line('frp', frp));
Object.keys(hints).forEach(function (k) {
  console.log(k + ' = ' + esc(hints[k]));
});
