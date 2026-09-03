export interface ImportFailure {
  code: string;
  message: string;
}

export type ImportOutcome =
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: ImportFailure };

function asFailure(value: unknown, fallbackCode: string, fallbackMessage: string): ImportFailure {
  if (typeof value === 'string' && value.trim()) {
    return { code: fallbackCode, message: value };
  }
  if (value && typeof value === 'object') {
    const error = value as { code?: unknown; message?: unknown };
    const code = typeof error.code === 'string' && error.code ? error.code : fallbackCode;
    const message = typeof error.message === 'string' && error.message ? error.message : fallbackMessage;
    return { code, message };
  }
  return { code: fallbackCode, message: fallbackMessage };
}

export function resolveImportOutcome(httpOk: boolean, payload: unknown): ImportOutcome {
  const result = payload && typeof payload === 'object'
    ? payload as { success?: unknown; data?: unknown; error?: unknown }
    : undefined;

  if (!httpOk) {
    return { success: false, error: asFailure(result?.error, 'POB_IMPORT_HTTP_FAILED', '导入请求失败。') };
  }
  if (result?.success !== true) {
    return { success: false, error: asFailure(result?.error, 'POB_IMPORT_FAILED', 'PoB 核心未能导入该配置。') };
  }
  if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
    return {
      success: false,
      error: {
        code: 'POB_IMPORT_CONTRACT_INVALID',
        message: 'PoB 核心未返回可应用的导入数据。',
      },
    };
  }
  return { success: true, data: result.data as Record<string, unknown> };
}
