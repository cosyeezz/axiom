// 发送链路乐观 UI：立即上屏、原位升级、失败态（确定/未知）、快照重建收敛。
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootSessionPage, until, settle } from './helpers/session-page.js';

test('配置在飞时发送立即上屏，实际请求等待配置', async t => {
  const page = bootSessionPage({ hold: req => req.type === 'session.configure' });
  t.after(page.close); page.open();
  await until(() => page.app.connected(), '连接');
  page.$('prompt').value = '等待配置';
  page.$('model').dispatchEvent(new page.window.Event('change'));
  await until(() => page.held() === 1, '配置在飞');
  await until(() => !page.$('send').disabled, '发送可用');
  const before = page.messages();
  page.$('composer').requestSubmit();
  assert.equal(page.messages(), before + 1);
  assert.equal(page.$('prompt').value, '', '等待配置前同步清空');
  page.paint(); await settle();
  assert.ok(!page.requests.some(req => req.type === 'prompt'));
  page.release();
  await until(() => page.requests.some(req => req.type === 'prompt'), '发送');
  assert.equal(page.requests.find(req => req.type === 'prompt').text, '等待配置');
});

test('配置失败不发消息，撤销乐观卡并保留草稿', async t => {
  const page = bootSessionPage({ hold: req => req.type === 'session.configure',
    respond: (req, base) => { if (req.type === 'session.configure') throw new Error('保存失败'); return base(req); } });
  t.after(page.close); page.open();
  await until(() => page.app.connected(), '连接');
  page.$('model').dispatchEvent(new page.window.Event('change'));
  await until(() => page.held() === 1, '配置在飞');
  page.$('prompt').value = '保留草稿';
  const before = page.messages();
  page.$('composer').requestSubmit();
  assert.equal(page.messages(), before + 1);
  page.paint(); await settle(); page.release();
  await until(() => !page.$('output').querySelector('.message-status'), '失败撤卡');
  assert.equal(page.messages(), before);
  assert.ok(!page.requests.some(req => req.type === 'prompt'));
  assert.equal(page.$('prompt').value, '保留草稿');
  assert.match(page.$('error').textContent, /保存失败/);
});

for (const fails of [false, true]) {
  test(`回执${fails ? '失败' : '成功'}不覆盖后续输入（包括相同文本）`, async t => {
    const page = bootSessionPage({ hold: req => req.type === 'prompt',
      respond: (req, base) => {
        if (fails && req.type === 'prompt') throw new Error('发送失败');
        return base(req);
      } });
    t.after(page.close); page.open();
    await until(() => page.app.connected(), '连接');
    page.$('prompt').value = '相同文本';
    page.$('composer').requestSubmit();
    assert.equal(page.$('prompt').value, '');
    page.paint();
    await until(() => page.held() === 1, '回执扣住');
    assert.equal(page.$('prompt').value, '');
    page.$('prompt').value = '相同文本';
    page.release();
    await settle();
    assert.equal(page.$('prompt').value, '相同文本');
  });
}

const userEnd = (runId, messageId, content, seq) => ({
  sessionId: 'long', type: 'agent.message.end', agentId: 'main', runId, seq,
  data: { message: { role: 'user', content }, entryId: messageId, messageId },
});

test('发送即时上屏「发送中」，确认事件原位升级不另建卡', async t => {
  const page = bootSessionPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  const before = page.messages();
  page.$('prompt').value = '马上看到我';
  page.$('composer').requestSubmit();
  // 同步渲染乐观卡：未等任何网络往返。
  assert.equal(page.messages(), before + 1, '乐观卡立即上屏');
  assert.equal(page.$('prompt').value, '', '无需等待绘制或网络回执');
  assert.match(page.$('output').querySelector('.message-status').parentElement.textContent, /马上看到我/);
  const status = page.$('output').querySelector('.message-status');
  assert.ok(status, '有发送中状态行');
  assert.match(status.textContent, /发送中/);
  const cardNode = page.$('output').querySelector('.message.user');
  page.paint(); // 驱动 nextPaint：绘制后才做序列化与派发
  await until(() => page.requests.some(r => r.type === 'prompt'), 'prompt 已派发');
  assert.equal(page.requests.findLast(r => r.type === 'prompt').text, '马上看到我');
  page.app.event(userEnd(undefined, 'u1', '马上看到我', 501));
  assert.equal(page.messages(), before + 1, '确认事件原位升级，不另建卡');
  assert.equal(page.$('output').querySelector('.message-status'), null, '状态行随升级移除');
  assert.equal(page.$('output').querySelector('.message.user'), cardNode, '同一条 DOM 消息');
  await until(() => page.$('prompt').value === '', '草稿在成功后清空');
});

test('整份重取在飞时提交：prompt 不被快照阻塞，乐观卡照常上屏', async t => {
  const page = bootSessionPage({
    // 扣住第二次以后的 attach（即手工触发的重取），首次挂载正常完成。
    hold: (req, requests) => req.type === 'session.attach' && requests.filter(r => r.type === 'session.attach').length > 1,
  });
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  page.paint();
  const before = page.messages();
  void page.app.reattach(); // 撞上重连/撑回前台等场景：快照在飞。
  page.$('prompt').value = '重取期间发送';
  page.$('composer').requestSubmit();
  assert.equal(page.messages(), before + 1, '乐观卡不等快照');
  page.paint();
  await until(() => page.requests.some(r => r.type === 'prompt'), 'prompt 已派发');
  assert.equal(page.requests.findLast(r => r.type === 'prompt').text, '重取期间发送');
  assert.equal(page.held(), 1, '快照仍在途：prompt 未被它阻塞');
  assert.equal(page.app.attachFlags().attaching, true);
  page.release();
  await until(() => page.app.attachFlags().attaching === false, '快照提交');
  await until(() => page.$('prompt').value === '', '草稿在成功后清空');
  assert.equal(page.messages(), 240, '快照重建后以服务端历史为准');
});

test('发送确定失败（response_error）：撤卡保草稿', async t => {
  const page = bootSessionPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  const original = page.app.request;
  page.app.setRequest(async (type, data) => {
    if (type === 'prompt') throw new Error('模型拒绝');
    return original(type, data);
  });
  page.$('prompt').value = '会被拒绝';
  page.$('composer').requestSubmit();
  assert.ok(page.$('output').querySelector('.message-status'), '乐观卡先上屏');
  page.paint();
  await until(() => page.$('output').querySelector('.message-status') === null, '失败撤卡');
  assert.equal(page.$('prompt').value, '会被拒绝', '草稿保留可改可重发');
});

test('发送结果未知（断线/超时）：保留卡并如实标注未确认', async t => {
  const page = bootSessionPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  const original = page.app.request;
  page.app.setRequest(async (type, data) => {
    if (type === 'prompt') {
      const e = new Error('发送超时');
      e.unknown = true;
      throw e;
    }
    return original(type, data);
  });
  page.$('prompt').value = '结果未知';
  page.$('composer').requestSubmit();
  page.paint();
  await until(() => page.$('output').querySelector('.message-status-unknown'), '未知态标注');
  const status = page.$('output').querySelector('.message-status');
  assert.match(status.textContent, /未确认/);
  assert.equal(page.count('结果未知'), 1, '卡保留可见，不伪装已确认也不静默丢弃');
  assert.equal(page.$('prompt').value, '', '未知结果不自动恢复，避免误重发');
});

test('runId 对账：不匹配的事件不认领乐观卡，匹配的原位升级', async t => {
  const page = bootSessionPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  const original = page.app.request;
  page.app.setRequest(async (type, data) => {
    if (type === 'prompt') return { runId: 'run-b' };
    return original(type, data);
  });
  page.$('prompt').value = '本轮输入';
  page.$('composer').requestSubmit();
  page.paint();
  // 清空不再代表回执到达，等待异步请求完成后验证 runId 对账。
  await settle();
  page.app.event(userEnd('run-a', 'x1', '别的轮次输入', 501));
  assert.equal(page.count('别的轮次输入'), 1, '不匹配事件另建卡');
  assert.ok(page.$('output').querySelector('.message-status'), '乐观卡仍在等自己的 runId');
  page.app.event(userEnd('run-b', 'u1', '本轮输入', 502));
  assert.equal(page.count('本轮输入'), 1, '匹配事件原位升级');
  assert.equal(page.$('output').querySelector('.message-status'), null);
});

test('快照重建重置乐观槽位：后续用户消息照常可见，不认领已废弃的卡', async t => {
  const page = bootSessionPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  page.$('prompt').value = '重建后';
  page.$('composer').requestSubmit();
  assert.ok(page.$('output').querySelector('.message-status'), '乐观卡先上屏');
  // 模拟重连/切换触发的快照整页重建：真实记录由快照重新挂载。
  page.app.snapshot(page.fullState());
  page.app.event(userEnd(undefined, 'u1', '重建后', 501));
  assert.equal(page.count('重建后'), 1, '事件消息可见，不因认领已废弃卡而消失');
  assert.equal(page.$('output').querySelector('.message-status'), null);
});
