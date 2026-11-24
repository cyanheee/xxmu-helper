// throwaway: emit \uXXXX-escaped JS array literals for the ASCII QA harness
var sets = {
  pcaps: ["秋叶小径","临湖晨读","后山晚云","银杏大道","图书馆暮色","操场晚风","校门晨光","实验楼窗台"],
  fbFrom: ["21级临床","22级药学","大一新生","图书馆常客","匿名同学"],
  fbKind: ["优化建议","问题反馈","优化建议","吐槽","感谢"],
  fbText: ["课表能不能加个周数切换，一目了然","教务登录有时候会超时，多点几次才好","希望 WIKI 能多放点校园照片","食堂人流能不能也做个提示","WIKI 照片墙这个横滑挺好看的，赞。"],
  fbReply: ["已记录，下个版本排上","已修复超时重试","欢迎投稿校园实景","收到，会考虑","谢谢，多提意见"]
};
function esc(s){
  var out='';
  for(var i=0;i<s.length;i++){
    var c=s.charCodeAt(i);
    out += c>127 ? '\\u'+('0000'+c.toString(16).toUpperCase()).slice(-4) : s[i];
  }
  return out;
}
Object.keys(sets).forEach(function(k){
  console.log(k+'=['+sets[k].map(function(x){return '"'+esc(x)+'"';}).join(',')+'];');
});
