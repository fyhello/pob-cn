return function()
  local configureHost = dofile('../cn/bridge/session-files.lua').install(os.getenv('POB_CN_SESSION_DIR'))
  local originalDofile, originalRead = dofile, io.read
  -- 官方无界面入口遇到错误会等待输入；桥接必须显式返回失败。
  io.read = function() return nil end
  dofile = function(path)
    if path == 'Launch.lua' then
      local originalPLoadModule = PLoadModule
      PLoadModule = function(fileName, ...)
        local err, value = originalPLoadModule(fileName, ...)
        if fileName == 'Modules/Main' and not err and value then configureHost(value) end
        return err, value
      end
    end
    return originalDofile(path)
  end
  local ok, result = pcall(originalDofile, 'HeadlessWrapper.lua')
  dofile, io.read = originalDofile, originalRead
  if not ok then error(result) end
  if launch and launch.promptMsg then error(launch.promptMsg) end
  return result
end
