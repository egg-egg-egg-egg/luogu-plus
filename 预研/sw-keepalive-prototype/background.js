// background.js — MV3 Service Worker 长任务保活原型
// ===========================================================================
// 方案：chrome.alarms 心跳保活（24s 一次，< 30s SW 休眠阈值）
//      + chrome.storage.local 断点续传（SW 被杀后从 done 续传）
//
// 模拟场景：班级批量更新学生 AC 记录
//   - 20 名学生，每 2 秒处理 1 名，总耗时约 40 秒
//   - 每 24 秒 alarm 触发一次 getPlatformInfo() 给 SW "续命"
//   - 每次循环把进度写进 storage.local，SW 重启后从断点恢复
//
// 代码组织：常量 -> 内存态 -> 工具函数 -> 长任务核心 -> alarm 心跳
//          -> SW 启动恢复 -> popup 消息监听
// 整个文件可直接迁移到主项目 src/background/ 下复用。
// ===========================================================================

// ---------------------------- 常量配置 ----------------------------
const STORAGE_KEY = 'task_state';       // 进度持久化在 storage.local 的 key
const ALARM_NAME = 'keepalive';         // 心跳 alarm 名称
const ALARM_PERIOD_MIN = 0.4;           // 24 秒，必须 < 30 秒 SW 休眠阈值
const LOOP_INTERVAL_MS = 2000;          // 模拟每个学生抓取间隔
const TOTAL_STUDENTS = 20;              // 模拟班级学生总数

// ---------------------------- 内存态（仅 SW 存活期间有效）----------------------------
// SW 被杀后这两者清零，必须能从 storage.local 重建。
let intervalId = null;      // 长任务 setInterval 句柄
let currentTaskId = null;   // 当前任务 ID，防止重复启动

// ---------------------------- 工具函数 ----------------------------

// 返回 [HH:MM:SS] 时间前缀，用于日志可读性
function getHHMMSS() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 读取 storage.local 中的任务状态
async function readState() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || null;
}

// 合并写入任务状态（浅合并，数组字段需调用方传完整新数组）
async function writeState(patch) {
  const current = await readState() || {};
  const merged = { ...current, ...patch };
  await chrome.storage.local.set({ [STORAGE_KEY]: merged });
  return merged;
}

// 停止内存中的 setInterval 循环
function stopLoop() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

// ---------------------------- 长任务核心 ----------------------------

// 启动一个全新任务
async function startTask() {
  // 防重入：已有任务在跑则拒绝
  const existing = await readState();
  if (existing && existing.status === 'running') {
    return { ok: false, reason: 'already_running' };
  }

  const taskId = `task_${Date.now()}`;
  currentTaskId = taskId;

  // 初始化任务状态并持久化（这是断点续传的"存档点"）
  const initialState = {
    taskId,
    total: TOTAL_STUDENTS,
    done: 0,
    status: 'running',
    startedAt: new Date().toISOString(),
    students: [],
    logs: [`[${getHHMMSS()}] 任务启动，共 ${TOTAL_STUDENTS} 名学生`]
  };
  await writeState(initialState);

  // 创建心跳 alarm：每 24s 触发一次，给 SW 续命
  // 注意：生产环境（打包扩展）Chrome 可能将 alarm 周期钳制到 1 分钟，
  //       但断点续传机制保证任务仍能最终完成（见文档"备选/健壮性"）。
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MIN });

  // 启动主循环
  intervalId = setInterval(tick, LOOP_INTERVAL_MS);
  return { ok: true, taskId };
}

// SW 重启后从断点恢复任务
// 触发时机：SW 顶层 bootstrap 检测到 storage 中有 status='running' 的任务
async function resumeTask(state) {
  currentTaskId = state.taskId;
  // SW 重启后 alarm 可能仍在（alarm 由浏览器持久化），但保险起见补建
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MIN });
  }
  // 追加恢复日志，便于验证时观察
  await writeState({
    logs: [...(state.logs || []), `[${getHHMMSS()}] SW 重启，从 ${state.done}/${state.total} 断点续传`]
  });
  // 重新启动循环；tick 内部会以 storage.done 为准推进
  intervalId = setInterval(tick, LOOP_INTERVAL_MS);
}

// 单次循环：处理 1 名学生，写进度，完成后收尾
async function tick() {
  const state = await readState();
  if (!state || state.status !== 'running') {
    // 状态已非 running（被 reset 或异常），停止循环
    stopLoop();
    return;
  }

  // 以 storage 中的 done 为唯一事实源，避免内存/存储不一致
  const done = state.done;
  if (done >= state.total) {
    // 全部完成：清理 alarm、停止循环、标记 completed
    stopLoop();
    await chrome.alarms.clear(ALARM_NAME);
    await writeState({
      status: 'completed',
      completedAt: new Date().toISOString(),
      logs: [...(state.logs || []), `[${getHHMMSS()}] 任务完成，共处理 ${state.total} 名学生`]
    });
    currentTaskId = null;
    return;
  }

  // ---- 处理下一个学生（真实场景这里替换为 fetch 洛谷用户页解析 AC 数）----
  const studentNo = done + 1;
  const student = {
    index: studentNo,
    name: `学生${studentNo}`,
    finishedAt: new Date().toISOString()
  };

  // 写回新进度（done+1、追加 student、追加日志）
  await writeState({
    done: studentNo,
    students: [...(state.students || []), student],
    logs: [...(state.logs || []), `[${getHHMMSS()}] 处理学生 ${studentNo}/${state.total} 完成`]
  });
}

// 重置任务到 idle（便于验证时反复测试）
async function resetTask() {
  stopLoop();
  await chrome.alarms.clear(ALARM_NAME);
  currentTaskId = null;
  await chrome.storage.local.remove(STORAGE_KEY);
  return { ok: true };
}

// ---------------------------- Alarm 心跳保活 ----------------------------
// alarm 每 24s 触发一次。关键点：在回调里调用一个异步 chrome API，
// 这会重置 SW 的 30 秒空闲计时器，从而"续命"。
// 仅靠 setInterval 无法阻止 SW 休眠，必须靠事件 + API 调用。
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  try {
    // 关键保活技巧：异步 chrome API 调用延长 SW 生命周期
    await chrome.runtime.getPlatformInfo();
  } catch (e) {
    // 忽略，保活目的已达（事件本身已唤醒 SW）
  }
  // 顺便检查任务是否已结束，若已结束则清理 alarm
  const state = await readState();
  if (!state || state.status !== 'running') {
    await chrome.alarms.clear(ALARM_NAME);
  }
});

// ---------------------------- SW 启动恢复（顶层立即执行）----------------------------
// SW 每次启动都会执行顶层代码。检查是否有未完成任务，有则断点续传。
// 这一步是"双保险"：即便 alarm 没能阻止休眠，SW 被杀后下次被任何事件
// （alarm / 消息 / 扩展图标点击）唤醒时，都能从这里自动恢复。
(async function bootstrap() {
  try {
    const state = await readState();
    if (state && state.status === 'running') {
      await resumeTask(state);
    }
  } catch (e) {
    console.error('[keepalive] bootstrap resume failed:', e);
  }
})();

// ---------------------------- Popup 消息监听 ----------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 返回 true 表示稍后异步调用 sendResponse
  (async () => {
    try {
      if (msg?.type === 'START_TASK') {
        const result = await startTask();
        sendResponse(result);
      } else if (msg?.type === 'GET_STATUS') {
        const state = await readState();
        sendResponse({ ok: true, state });
      } else if (msg?.type === 'RESET') {
        const result = await resetTask();
        sendResponse(result);
      } else {
        sendResponse({ ok: false, reason: 'unknown_command' });
      }
    } catch (e) {
      sendResponse({ ok: false, reason: String(e) });
    }
  })();
  return true;
});
