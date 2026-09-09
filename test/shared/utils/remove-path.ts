import fs from 'fs';

interface RemovePathOptions {
  recursive?: boolean;
  force?: boolean;
}

type RemovePathSync = (path: string, options?: RemovePathOptions) => void;

/**
 * 使用开发工具链提供的现代 fs.rmSync 删除测试临时路径。
 *
 * 发布源码按 Node.js 12 类型检查，而测试固定在 Node.js 20.20.2 运行；
 * 窄类型断言将仅用于测试的现代文件系统 API 隔离在此处，避免放宽生产源码类型。
 *
 * @param path 待删除的文件或目录路径
 * @param options 删除选项
 * @returns 无返回值
 * @throws 删除失败或开发运行时缺少 fs.rmSync 时抛出文件系统异常
 */
export function removePathSync(path: string, options: RemovePathOptions = {}): void {
  const rmSync = (fs as typeof fs & { rmSync?: RemovePathSync }).rmSync;

  if (!rmSync) {
    throw new Error('The development runtime must provide fs.rmSync');
  }

  rmSync(path, options);
}
