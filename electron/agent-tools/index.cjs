const path = require('path')
const { WorkspaceManager } = require('./workspace.cjs')
const { TERMINATION_GUARANTEE, TerminalManager } = require('./terminal.cjs')
const { MacOSComputerTools } = require('./macos.cjs')
const { assertBoundedInput, requireApproval } = require('./security.cjs')

function createAgentTools({ userDataPath, tempPath, systemPreferences, defaultRoot = '', fallbackRoot = '', platform = process.platform } = {}) {
  const workspace = new WorkspaceManager({
    settingsPath: path.join(userDataPath, 'agent-tools', 'settings.json'),
    defaultRoot,
    fallbackRoot
  })
  const terminal = new TerminalManager({ workspace })
  const computer = new MacOSComputerTools({ platform, systemPreferences, tempPath })

  return {
    initialize: () => workspace.initialize(),
    getCapabilities: async () => ({
      ok: true,
      platform,
      workspace: true,
      workspacePatch: {
        available: true,
        format: 'line_hunks_v1',
        requiresBaseSha256: true,
        atomicRevert: true,
        maxApprovalBytes: 32 * 1024
      },
      terminal: true,
      terminalCancellation: { ...TERMINATION_GUARANTEE },
      computer: {
        permissions: platform === 'darwin',
        captureScreen: platform === 'darwin',
        openApplication: platform === 'darwin',
        click: platform === 'darwin',
        typeText: platform === 'darwin'
      },
      workspaceRoot: (await workspace.getRoot()).workspaceRoot
    }),
    getWorkspaceRoot: () => workspace.getRoot(),
    getWorkspaceIdentity: () => workspace.getIdentity(),
    setWorkspaceRoot: async (input = {}) => {
      assertBoundedInput(input)
      requireApproval(input.approval, 'workspace.set')
      return workspace.setRoot(input.path)
    },
    approveWorkspaceChoice: (input = {}) => {
      assertBoundedInput(input, 4 * 1024)
      requireApproval(input.approval, 'workspace.choose')
      return true
    },
    setChosenWorkspaceRoot: pathValue => workspace.setRoot(pathValue),
    listFiles: input => workspace.listFiles(input),
    readFile: input => workspace.readFile(input),
    writeFile: input => workspace.writeFile(input),
    applyPatch: input => workspace.applyPatch(input),
    prepareRevertPatch: input => workspace.prepareRevertPatch(input),
    revertPatch: input => workspace.revertPatch(input),
    searchFiles: input => workspace.searchFiles(input),
    startCommand: input => terminal.start(input),
    getCommand: input => terminal.get(input),
    cancelCommand: input => terminal.cancel(input),
    shutdown: () => terminal.shutdown({ force: true }),
    getPermissions: () => computer.getPermissions(),
    captureScreen: input => computer.captureScreen(input),
    openApplication: input => computer.openApplication(input),
    click: input => computer.click(input),
    typeText: input => computer.typeText(input)
  }
}

module.exports = { createAgentTools }
