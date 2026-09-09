import { randomUUID } from 'node:crypto';
import * as filesystem from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

// 全部内容先验证再调用；任何可捕获的写入失败都会恢复本次涉及的文件。
export async function writeFileTransaction(root, outputs, io = filesystem) {
  root = resolve(root);
  const before = [], staged = [], written = [];
  const errors = [];
  try {
    for (const output of outputs) {
      const path = resolve(root, output.path);
      if (!path.startsWith(root + sep) || before.some(entry => entry.path === path)) throw new Error('事务路径越界或重复');
      let contents;
      try { contents = await io.readFile(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      before.push({ path, contents });
      await io.mkdir(dirname(path), { recursive: true });
      const temporary = path + '.translation-txn-' + randomUUID();
      staged.push({ path, temporary });
      await io.writeFile(temporary, output.contents);
    }
    for (const entry of staged) { await io.rename(entry.temporary, entry.path); written.push(entry.path); }
  } catch (error) {
    errors.push(error);
    for (const entry of before.filter(entry => written.includes(entry.path))) {
      try {
        if (entry.contents === undefined) await io.rm(entry.path, { force: true });
        else await io.writeFile(entry.path, entry.contents);
      } catch (restoreError) { errors.push(restoreError); }
    }
  } finally {
    for (const entry of staged) {
      try { await io.rm(entry.temporary, { force: true }); } catch (error) { errors.push(error); }
    }
  }
  if (errors.length) throw errors.length === 1 ? errors[0] : new AggregateError(errors, '文件事务失败；包含恢复或暂存清理错误');
}
