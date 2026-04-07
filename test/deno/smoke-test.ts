/**
 * Deno 兼容性冒烟测试
 *
 * 验证在 Deno 运行时（Node.js 兼容层）下，库的核心功能能在 5 秒内完成降级响应。
 * 运行方式：deno run --allow-read --allow-env --allow-sys test/deno/smoke-test.ts
 *
 * SC-005: 降级响应时间 < 5000ms
 *
 * 注意：dist 产物为 CommonJS 格式，需通过 createRequire 加载，
 * 否则 Deno 默认将 .js 视为 ESM，导致 "exports is not defined" 错误。
 */

import { createRequire } from 'node:module';

const MAX_MS = 5000;

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
  const START = Date.now();

  // 使用 createRequire 显式以 CommonJS 模式加载 dist 产物
  const require = createRequire(import.meta.url);
  // @ts-ignore — 仅在 Deno 运行时下执行
  const { createOSUtils } = require('../../dist/src/index.js');

  const utils = createOSUtils();

  const [cpuResult, memResult, overviewResult] = await Promise.allSettled([
    utils.cpu.info(),
    utils.memory.info(),
    utils.overview()
  ]);

  const elapsed = Date.now() - START;

  // CPU info 应成功（os.cpus() 降级路径）
  if (cpuResult.status === 'fulfilled' && cpuResult.value.success) {
    const data = cpuResult.value.data;
    if (!data.threads || data.threads <= 0) {
      console.error('[FAIL] CPU info: threads must be > 0, got', data.threads);
      // @ts-ignore
      Deno.exit(1);
    }
    console.log('[PASS] CPU info: threads =', data.threads);
  } else if (cpuResult.status === 'rejected') {
    console.error('[FAIL] CPU info threw unexpectedly:', cpuResult.reason);
    // @ts-ignore
    Deno.exit(1);
  } else {
    // 可接受的 MonitorResult failure（部分平台不支持）
    console.log('[SKIP] CPU info not supported on this platform');
  }

  // Memory info 应成功（os.totalmem()/os.freemem() 降级路径或正常路径）
  if (memResult.status === 'fulfilled' && memResult.value.success) {
    const data = memResult.value.data;
    if (!data.total || data.total <= 0) {
      console.error('[FAIL] Memory info: total must be > 0, got', data.total);
      // @ts-ignore
      Deno.exit(1);
    }
    console.log('[PASS] Memory info: total =', data.total);
  } else if (memResult.status === 'rejected') {
    console.error('[FAIL] Memory info threw unexpectedly:', memResult.reason);
    // @ts-ignore
    Deno.exit(1);
  } else {
    console.log('[SKIP] Memory info not supported on this platform');
  }

  // overview 不应整体 crash
  if (overviewResult.status === 'rejected') {
    console.error('[FAIL] overview() threw:', overviewResult.reason);
    // @ts-ignore
    Deno.exit(1);
  }
  console.log('[PASS] overview() completed without crash');

  // SC-005 性能约束
  if (elapsed > MAX_MS) {
    console.error(`[FAIL] SC-005: elapsed ${elapsed}ms exceeds limit ${MAX_MS}ms`);
    // @ts-ignore
    Deno.exit(1);
  }
  console.log(`[PASS] SC-005: elapsed ${elapsed}ms < ${MAX_MS}ms`);
  console.log('[DONE] Deno smoke test passed');
})();
