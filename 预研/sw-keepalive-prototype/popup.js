// popup.js — UI 交互 + 每 500ms 轮询 background 获取进度
// ===========================================================================
// 职责仅限 UI 展示与指令下发，所有任务状态以 background 的 storage.local 为准。
// ===========================================================================

const $status = document.getElementById('status');
const $startBtn = document.getElementById('startBtn');
const $resetBtn = document.getElementById('resetBtn');
const $progressBar = document.getElementById('progressBar');
const $count = document.getElementById('count');
const $logs = document.getElementById('logs');

// 向 background 发消息的封装
function send(type) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type }, (resp) => resolve(resp || { ok: false }));
  });
}

// 根据状态对象刷新 UI
function render(state) {
  if (!state) {
    $status.textContent = 'idle';
    $status.className = 'status idle';
    $startBtn.disabled = false;
    $progressBar.style.width = '0%';
    $count.textContent = `0 / 20`;
    $logs.textContent = '';
    return;
  }

  const total = state.total || 20;
  const done = state.done || 0;
  const pct = Math.round((done / total) * 100);

  $status.textContent = state.status;
  $status.className = `status ${state.status}`;
  $progressBar.style.width = pct + '%';
  $count.textContent = `${done} / ${total}`;

  $startBtn.disabled = state.status === 'running';

  // 日志区追加显示（取后 200 行避免过长）
  const logs = state.logs || [];
  $logs.textContent = logs.slice(-200).join('\n');
  // 自动滚到底
  $logs.scrollTop = $logs.scrollHeight;
}

// 启动任务
$startBtn.addEventListener('click', async () => {
  $startBtn.disabled = true;
  const resp = await send('START_TASK');
  if (!resp.ok) {
    alert('启动失败：' + (resp.reason || '未知原因'));
    $startBtn.disabled = false;
  }
  // 立即拉一次状态
  refresh();
});

// 重置任务到 idle
$resetBtn.addEventListener('click', async () => {
  await send('RESET');
  refresh();
});

// 拉取一次最新状态
async function refresh() {
  const resp = await send('GET_STATUS');
  if (resp.ok) render(resp.state);
  else render(null);
}

// 每 500ms 轮询进度
refresh();
setInterval(refresh, 500);
