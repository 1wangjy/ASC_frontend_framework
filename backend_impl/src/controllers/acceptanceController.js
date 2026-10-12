'use strict';

/**
 * 验收测试控制器（「模型入口 → 验收测试[2026]」的后端入口）。
 * 只读本机资源 + 调本机服务，不写任何业务数据；与本平台其它路由互不干扰。
 */

const acceptanceService = require('../services/acceptanceService');

class AcceptanceController {
  constructor() {
    this.listChecks = this.listChecks.bind(this);
    this.runOne = this.runOne.bind(this);
    this.runAll = this.runAll.bind(this);
  }

  /** GET /api/acceptance/checks —— 验收项与检查清单（声明式，不含执行结果） */
  listChecks(req, res) {
    try {
      res.json({ code: 200, data: acceptanceService.publicRegistry() });
    } catch (error) {
      res.status(500).json({ code: 500, message: error.message });
    }
  }

  /** POST /api/acceptance/run/:id —— 运行单条检查，返回 JSON 结果 */
  async runOne(req, res) {
    try {
      const result = await acceptanceService.runCheck(String(req.params.id || ''));
      res.json({ code: 200, data: result });
    } catch (error) {
      res.status(500).json({ code: 500, message: error.message });
    }
  }

  /**
   * POST /api/acceptance/run —— 批量运行，SSE 流式回传（每条检查完成即推送）
   * 事件：`event: check` / `event: done`；注释帧作心跳，避免代理超时。
   */
  async runAll(req, res) {
    const only = Array.isArray(req.body?.only) && req.body.only.length ? req.body.only.map(String) : null;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const send = (text) => { if (!res.writableEnded) { try { res.write(text); } catch { /* 连接已断 */ } } };
    const heartbeat = setInterval(() => send(': heartbeat\n\n'), 5000);
    const finish = (frame) => {
      clearInterval(heartbeat);
      send(frame);
      try { res.end(); } catch { /* 已结束 */ }
    };

    try {
      const { results, summary } = await acceptanceService.runAll({
        only,
        onResult: (result) => send(`event: check\ndata: ${JSON.stringify(result)}\n\n`),
      });
      finish(`event: done\ndata: ${JSON.stringify({ summary, total: results.length })}\n\n`);
    } catch (error) {
      finish(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
    }
  }
}

module.exports = new AcceptanceController();
