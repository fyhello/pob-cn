local M = {}

function M.install(directory)
  assert(type(directory) == 'string' and directory ~= '', 'POB_CN_SESSION_DIR is required')
  directory = directory:gsub('\\', '/'):gsub('/$', '')
  local originalOpen, originalRemove, originalRename = io.open, os.remove, os.rename
  local redirected, nextId = {}, 0
  local function privatePath(path)
    local normalized = path:gsub('\\', '/')
    if normalized:sub(1, #directory + 1) == directory .. '/' then return normalized end
    if not redirected[normalized] then
      nextId = nextId + 1
      redirected[normalized] = directory .. '/files/' .. nextId
    end
    return redirected[normalized]
  end
  io.open = function(path, mode, ...)
    local normalized = path:gsub('\\', '/')
    if mode and (mode:find('w') or mode:find('a') or mode:find('+', 1, true)) then
      return originalOpen(privatePath(path), mode, ...)
    end
    if normalized == 'first.run' or normalized == 'installed.cfg' then
      return originalOpen(privatePath(path), mode, ...)
    end
    return originalOpen(redirected[normalized] or path, mode, ...)
  end
  os.remove = function(path) return originalRemove(privatePath(path)) end
  os.rename = function(source, target) return originalRename(privatePath(source), privatePath(target)) end
  return function(host)
    local changeUserPath = host.ChangeUserPath
    host.ChangeUserPath = function(self, _, ignoreBuild)
      return changeUserPath(self, directory .. '/', ignoreBuild)
    end
  end
end

return M
