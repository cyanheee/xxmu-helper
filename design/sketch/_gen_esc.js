/* throwaway: emit \uXXXX-escaped Chinese for the ASCII-only QA harness.
 * Doubles as a module: make_nova_real.js requires { S, esc } and injects
 * the escaped literals into the browser-side harness, so its source stays
 * 100% ASCII (no Chinese literals, no hand-written \uXXXX in the harness).
 *   node _gen_esc.js          -> print the arrays (human check)
 *   node make_nova_real.js    -> require() this, no stdout side effects
 */
const S = {
  pcaps: [
    '秋叶与旧教学楼','临湖的晨体操','后山的云','银杏道的午后',
    '图书馆暮色','操场晚风','校门晨光','实验楼窗台',
    '钟楼下的自行车','雨后的跑道','解剖楼的走廊','三楼的落地窗'
  ],
  fbFrom: ['同学','匿名','大三学长','同学','匿名','大二同学','同学','匿名','同学'],
  fbKind: ['优化建议','资料纠错','功能许愿','其它','优化建议','资料纠错','功能许愿','其它','优化建议'],
  fbText: [
    '课表能不能加个周视图切换呀，翻周好累。',
    '学校概况里的电话好像换了，官网是新号。',
    '想要一个考试倒计时，放在首页就好。',
    '校园地图能不能标一下快递点？',
    'WIKI 照片墙这个横滑挺好看的，赞。',
    '实验楼那间教室号标错了，是 B305。',
    '能不能加个校车实时位置呀，等车好冷。',
    '希望加个深色模式定时切换。',
    '留言板能按时间排序就更好啦。'
  ],
  fbReply: [
    '已收到，排进下个版本看看。','已核对并更新，谢谢提醒！','记下了，评估一下工作量。','',
    '谢谢～','已修正，多谢指正。','收到，看看有没有数据源。','已经在排期里了。','好主意，记下了。'
  ],
  labels: [
    '校园实景','留言板','管理员回复',
    '这些是同学自己拍的。上传后要管理员审核通过才会公开，只放校园实景，别放人脸和宿舍内部。',
    '想加功能、发现 bug、资料有错，都可以在这里说，不用加群。管理员回复后会显示在下面。',
    '刷新','传一张','说两句'
  ],
  /* pill button labels (lead from real wiki.js heads) */
  pills: ['↻ 刷新', '+ 传一张', '↻ 刷新', '+ 说两句'],
  /* .fb-at timestamps, ASCII-only so esc() still yields \uXXXX */
  fbAt: ['11-09 08:12','11-08 22:41','11-08 16:05','11-07 12:30',
         '11-06 19:48','11-06 09:14','11-05 21:02','11-05 10:37','11-04 15:26'],
  misc: ['常用资料','校历 2026-2027','图书馆开放时间','校医院值班电话']
};
function esc(s){
  return '"' + [...s].map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4,'0')).join('') + '"';
}
if (require.main === module) {
  for (const k in S) console.log(k + '=[' + S[k].map(esc).join(',') + '];');
}
module.exports = { S, esc };
