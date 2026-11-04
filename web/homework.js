/* 内置作业兜底：故意留空。
 *
 * 原先是打包时用 core/sync_hw.py 抓的一份快照，装好就冻结在那一刻：
 * 交了作业还显示「待做」，过了截止时间倒计时还在跑。
 *
 * 现在一律由 App 内 chaoxing.js 实时抓取（学习 → 登录学习通 → 刷新）。
 */
window.HOMEWORK = {"synced_at":0,"source":"","term_label":"","total":0,"pending":0,"courses":0,"works":[],"exams":[],"exam_total":0,"exam_upcoming":0,"errors":[]};
