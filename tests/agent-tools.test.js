import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { PassThrough } from 'node:stream'
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { WorkspaceManager } = require('../electron/agent-tools/workspace.cjs')
const { TerminalManager } = require('../electron/agent-tools/terminal.cjs')
const {
  MacOSComputerTools,
  CLICK_SCRIPT,
  FRONTMOST_APPLICATION_SCRIPT,
  TYPE_SCRIPT
} = require('../electron/agent-tools/macos.cjs')
const {
  MAX_NATIVE_PATCH_BYTES,
  MAX_NATIVE_WRITE_BYTES,
  agentToolApprovalDetail,
  bindWorkspaceApprovalPayload,
  canonicalizeAgentToolPayload
} = require('../electron/agent-tools/approval.cjs')
const { createAgentTools } = require('../electron/agent-tools/index.cjs')

async function fixture() {
  const base = await mkdtemp(path.join(os.tmpdir(), 'yufeng-agent-tools-'))
  const root = path.join(base, 'workspace')
  const outside = path.join(base, 'outside')
  await mkdir(path.join(root, 'src'), { recursive: true })
  await mkdir(path.join(root, 'node_modules', 'ignored'), { recursive: true })
  await mkdir(path.join(root, '.docker'), { recursive: true })
  await mkdir(path.join(root, '.config', 'gcloud'), { recursive: true })
  await mkdir(path.join(root, '.oci'), { recursive: true })
  await mkdir(outside, { recursive: true })
  await writeFile(path.join(root, 'src', 'hello.txt'), 'alpha\nneedle here\nomega\n')
  await writeFile(path.join(root, 'node_modules', 'ignored', 'match.txt'), 'needle must stay ignored')
  await writeFile(path.join(root, '.env'), 'OPENAI_API_KEY=sk-test-secret-value-1234567890')
  await writeFile(path.join(root, '.git-credentials'), 'https://user:password@example.com')
  await writeFile(path.join(root, '.docker', 'config.json'), '{"auths":{"example.com":{"auth":"dXNlcjpwYXNz"}}}')
  await writeFile(path.join(root, '.config', 'gcloud', 'credentials.db'), 'cloud-secret')
  await writeFile(path.join(root, '.oci', 'config'), 'tenancy=secret')
  await writeFile(path.join(root, 'src', 'credentials-in-text.txt'), 'token=very-secret-token-value\npublic line')
  await writeFile(path.join(root, 'src', 'cloud-config.txt'), [
    'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    'DATABASE_URL=postgres://admin:database-password@db.example/app',
    '{"password":"hunter2","client_secret":"plainsecret"}',
    'const secret = process.env.APP_SECRET'
  ].join('\n'))
  await writeFile(path.join(outside, 'secret.txt'), 'outside secret')
  return { base, root, outside }
}

async function waitForTerminal(terminal, jobId, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const job = terminal.get({ jobId })
    if (!['running', 'cancelling'].includes(job.status)) return job
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('terminal job did not finish')
}

async function bindWorkspaceMutation(workspace, action, input = {}) {
  const identity = await workspace.getIdentity()
  return {
    ...input,
    workspaceRoot: identity.workspaceRoot,
    workspaceGeneration: identity.workspaceGeneration,
    approval: { granted: true, action }
  }
}

test('workspace tools stay inside the canonical root and reject symlinks', async () => {
  const files = await fixture()
  try {
    const workspace = new WorkspaceManager({ settingsPath: path.join(files.base, 'settings.json') })
    await workspace.setRoot(files.root)

    const listing = await workspace.listFiles({ path: 'src' })
    assert.deepEqual(listing.entries.map(entry => entry.name), ['cloud-config.txt', 'credentials-in-text.txt', 'hello.txt'])
    assert.equal((await workspace.readFile({ path: 'src/hello.txt' })).content, 'alpha\nneedle here\nomega\n')
    assert.match((await workspace.readFile({ path: 'src/credentials-in-text.txt' })).content, /token=\[redacted\]/)
    const cloudConfig = (await workspace.readFile({ path: 'src/cloud-config.txt' })).content
    assert.doesNotMatch(cloudConfig, /wJalr|database-password|hunter2|plainsecret/)
    assert.match(cloudConfig, /"password":"\[redacted\]"/)
    assert.match(cloudConfig, /"client_secret":"\[redacted\]"/)
    assert.match(cloudConfig, /const secret = process\.env\.APP_SECRET/)
    await assert.rejects(workspace.readFile({ path: '.env' }), error => error.code === 'SENSITIVE_FILE_REQUIRES_EXPLICIT_ACCESS')
    for (const sensitivePath of [
      '.git-credentials',
      '.docker/config.json',
      '.config/gcloud/credentials.db',
      '.oci/config'
    ]) {
      await assert.rejects(
        workspace.readFile({ path: sensitivePath }),
        error => error.code === 'SENSITIVE_FILE_REQUIRES_EXPLICIT_ACCESS'
      )
    }
    const search = await workspace.searchFiles({ path: '.', query: 'needle' })
    assert.deepEqual(search.matches.map(match => [match.path, match.line]), [['src/hello.txt', 2]])
    assert.equal((await workspace.searchFiles({ path: '.', query: 'sk-test-secret' })).matches.length, 0)
    assert.equal((await workspace.searchFiles({ path: '.', query: 'dXNlcjpwYXNz' })).matches.length, 0)
    assert.equal((await workspace.searchFiles({ path: '.', query: 'cloud-secret' })).matches.length, 0)

    await assert.rejects(
      workspace.writeFile({ path: 'src/new.txt', content: 'new' }),
      error => error.code === 'APPROVAL_REQUIRED'
    )
    const updated = await workspace.writeFile(await bindWorkspaceMutation(workspace, 'workspace.write', {
      path: 'src/hello.txt',
      content: 'updated text'
    }))
    assert.equal(updated.created, false)
    assert.equal(updated.bytes, 12)
    assert.match(updated.beforeSha256, /^[a-f0-9]{64}$/)
    assert.match(updated.afterSha256, /^[a-f0-9]{64}$/)
    assert.notEqual(updated.beforeSha256, updated.afterSha256)
    assert.equal('content' in updated, false)
    assert.equal(await readFile(path.join(files.root, 'src', 'hello.txt'), 'utf8'), 'updated text')

    await assert.rejects(
      workspace.writeFile(await bindWorkspaceMutation(workspace, 'workspace.write', {
        path: 'src/new.txt',
        content: 'new'
      })),
      error => error.code === 'FILE_NOT_FOUND'
    )
    const created = await workspace.writeFile(await bindWorkspaceMutation(workspace, 'workspace.write', {
      path: 'src/new.txt',
      content: 'new',
      create: true
    }))
    assert.equal(created.created, true)
    assert.equal(created.beforeSha256, null)
    assert.equal(created.bytes, 3)

    await writeFile(path.join(files.root, 'src', 'binary.bin'), Buffer.from([1, 0, 2]))
    await assert.rejects(
      workspace.writeFile(await bindWorkspaceMutation(workspace, 'workspace.write', {
        path: 'src/binary.bin',
        content: 'text'
      })),
      error => error.code === 'BINARY_FILE_FORBIDDEN'
    )
    await assert.rejects(
      workspace.writeFile(await bindWorkspaceMutation(workspace, 'workspace.write', {
        path: 'missing/new.txt',
        content: 'text',
        create: true
      })),
      error => error.code === 'PATH_NOT_FOUND'
    )
    await assert.rejects(
      workspace.writeFile(await bindWorkspaceMutation(workspace, 'workspace.write', {
        path: 'src/too-large.txt',
        content: 'x'.repeat((4 * 1024 * 1024) + 1),
        create: true
      })),
      error => error.code === 'FILE_TOO_LARGE'
    )

    await assert.rejects(workspace.readFile({ path: '../outside/secret.txt' }), error => error.code === 'PATH_OUTSIDE_WORKSPACE')
    await assert.rejects(workspace.readFile({ path: path.join(files.root, 'src/hello.txt') }), error => error.code === 'ABSOLUTE_PATH_FORBIDDEN')

    if (process.platform !== 'win32') {
      await symlink(files.outside, path.join(files.root, 'linked-outside'))
      await assert.rejects(workspace.readFile({ path: 'linked-outside/secret.txt' }), error => error.code === 'SYMLINK_FORBIDDEN')
      await symlink(path.join(files.outside, 'secret.txt'), path.join(files.root, 'src', 'linked-file.txt'))
      await assert.rejects(
        workspace.writeFile(await bindWorkspaceMutation(workspace, 'workspace.write', {
          path: 'src/linked-file.txt',
          content: 'overwrite'
        })),
        error => error.code === 'SYMLINK_FORBIDDEN'
      )
    }

    const restored = new WorkspaceManager({ settingsPath: path.join(files.base, 'settings.json') })
    assert.equal((await restored.getRoot()).workspaceRoot, await (await import('node:fs/promises')).realpath(files.root))
  } finally {
    await rm(files.base, { recursive: true, force: true })
  }
})

test('workspace patch applies exact line hunks against a SHA-bound base', async () => {
  const files = await fixture()
  try {
    const workspace = new WorkspaceManager()
    await workspace.setRoot(files.root)
    const before = await workspace.readFile({ path: 'src/hello.txt' })
    assert.match(before.sha256, /^[a-f0-9]{64}$/)

    const patchInput = {
      path: 'src/hello.txt',
      beforeSha256: before.sha256,
      hunks: [
        { startLine: 2, oldLines: ['needle here'], newLines: ['patched line', 'added line'] }
      ]
    }
    await assert.rejects(workspace.applyPatch(patchInput), error => error.code === 'APPROVAL_REQUIRED')
    const applied = await workspace.applyPatch(await bindWorkspaceMutation(
      workspace,
      'workspace.patch',
      patchInput
    ))
    assert.equal(applied.ok, true)
    assert.equal(applied.path, 'src/hello.txt')
    assert.equal(applied.beforeSha256, before.sha256)
    assert.notEqual(applied.afterSha256, before.sha256)
    assert.deepEqual(applied.diff.hunks, patchInput.hunks)
    assert.equal(applied.diff.finalNewlineBefore, true)
    assert.equal(applied.diff.finalNewlineAfter, true)
    assert.equal(await readFile(path.join(files.root, 'src', 'hello.txt'), 'utf8'), 'alpha\npatched line\nadded line\nomega\n')

    await assert.rejects(workspace.applyPatch(await bindWorkspaceMutation(
      workspace,
      'workspace.patch',
      patchInput
    )), error => error.code === 'PATCH_BASE_MISMATCH')

    assert.match(applied.diff.rollbackId, /^[0-9a-f-]{36}$/i)
    const preparedRevert = workspace.prepareRevertPatch({
      rollbackId: applied.diff.rollbackId,
      revertsDiffId: 'diff-original',
    })
    const reverted = await workspace.revertPatch(await bindWorkspaceMutation(
      workspace,
      'workspace.revert_patch',
      preparedRevert
    ))
    assert.equal(reverted.diff.operation, 'revert')
    assert.equal(reverted.diff.revertsDiffId, 'diff-original')
    assert.match(reverted.diff.rollbackId, /^[0-9a-f-]{36}$/i)
    assert.equal(reverted.afterSha256, before.sha256)
    assert.equal(await readFile(path.join(files.root, 'src', 'hello.txt'), 'utf8'), 'alpha\nneedle here\nomega\n')
    await assert.rejects(workspace.revertPatch(await bindWorkspaceMutation(workspace, 'workspace.revert_patch', {
      path: applied.path,
      expectedCurrentSha256: applied.afterSha256,
      expectedRevertedSha256: applied.beforeSha256,
      hunks: applied.diff.hunks,
      finalNewlineBefore: true,
      finalNewlineAfter: true
    })), error => error.code === 'PATCH_BASE_MISMATCH')
    assert.throws(
      () => workspace.prepareRevertPatch({ rollbackId: applied.diff.rollbackId }),
      error => error.code === 'ROLLBACK_RECORD_NOT_FOUND'
    )

    const current = await workspace.readFile({ path: 'src/hello.txt' })
    await assert.rejects(workspace.applyPatch(await bindWorkspaceMutation(workspace, 'workspace.patch', {
      path: 'src/hello.txt',
      beforeSha256: current.sha256,
      hunks: [{ startLine: 2, oldLines: ['wrong context'], newLines: ['nope'] }]
    })), error => error.code === 'PATCH_CONTEXT_MISMATCH')
    await assert.rejects(workspace.applyPatch(await bindWorkspaceMutation(workspace, 'workspace.patch', {
      path: '.env',
      beforeSha256: 'a'.repeat(64),
      hunks: [{ startLine: 1, oldLines: ['x'], newLines: ['y'] }]
    })), error => error.code === 'SENSITIVE_FILE_REQUIRES_EXPLICIT_ACCESS')
  } finally {
    await rm(files.base, { recursive: true, force: true })
  }
})

test('workspace patch and revert revalidate target identity after writing the temporary file', async () => {
  const files = await fixture()
  const originalWriteFile = fs.promises.writeFile
  try {
    const workspace = new WorkspaceManager()
    await workspace.setRoot(files.root)
    const targetPath = path.join(files.root, 'src', 'hello.txt')
    const before = await workspace.readFile({ path: 'src/hello.txt' })
    const patchInput = await bindWorkspaceMutation(workspace, 'workspace.patch', {
      path: 'src/hello.txt',
      beforeSha256: before.sha256,
      hunks: [{ startLine: 2, oldLines: ['needle here'], newLines: ['patched'] }]
    })

    let swappedPatchTarget = false
    fs.promises.writeFile = async (filePath, ...args) => {
      const result = await originalWriteFile.call(fs.promises, filePath, ...args)
      if (!swappedPatchTarget && path.basename(String(filePath)).startsWith('.yufeng-agent-patch-')) {
        swappedPatchTarget = true
        await fs.promises.rename(targetPath, `${targetPath}.concurrent`)
        await originalWriteFile.call(fs.promises, targetPath, before.content)
      }
      return result
    }
    await assert.rejects(
      workspace.applyPatch(patchInput),
      error => error.code === 'PATCH_BASE_MISMATCH'
    )
    assert.equal(await readFile(targetPath, 'utf8'), before.content)

    fs.promises.writeFile = originalWriteFile
    const applied = await workspace.applyPatch(await bindWorkspaceMutation(workspace, 'workspace.patch', {
      path: 'src/hello.txt',
      beforeSha256: before.sha256,
      hunks: [{ startLine: 2, oldLines: ['needle here'], newLines: ['patched'] }]
    }))
    const prepared = workspace.prepareRevertPatch({ rollbackId: applied.diff.rollbackId })

    let changedRevertTarget = false
    fs.promises.writeFile = async (filePath, ...args) => {
      const result = await originalWriteFile.call(fs.promises, filePath, ...args)
      if (!changedRevertTarget && path.basename(String(filePath)).startsWith('.yufeng-agent-revert-')) {
        changedRevertTarget = true
        await originalWriteFile.call(fs.promises, targetPath, 'concurrent edit\n')
      }
      return result
    }
    await assert.rejects(
      workspace.revertPatch(await bindWorkspaceMutation(workspace, 'workspace.revert_patch', prepared)),
      error => error.code === 'PATCH_BASE_MISMATCH'
    )
    assert.equal(await readFile(targetPath, 'utf8'), 'concurrent edit\n')
  } finally {
    fs.promises.writeFile = originalWriteFile
    await rm(files.base, { recursive: true, force: true })
  }
})

test('workspace identity binding rejects approved write, patch, terminal, and prepared revert after root changes', async () => {
  const files = await fixture()
  try {
    const secondRoot = path.join(files.base, 'workspace-clone')
    await mkdir(path.join(secondRoot, 'src'), { recursive: true })
    await writeFile(path.join(secondRoot, 'src', 'hello.txt'), 'alpha\nneedle here\nomega\n')
    const workspace = new WorkspaceManager()
    await workspace.setRoot(files.root)
    const before = await workspace.readFile({ path: 'src/hello.txt' })
    const approvedForFirstRoot = await bindWorkspaceMutation(workspace, 'workspace.patch', {
      path: 'src/hello.txt',
      beforeSha256: before.sha256,
      hunks: [{ startLine: 2, oldLines: ['needle here'], newLines: ['patched'] }]
    })
    const approvedWriteForFirstRoot = await bindWorkspaceMutation(workspace, 'workspace.write', {
      path: 'src/hello.txt',
      content: 'must not reach the new root\n'
    })
    const approvedTerminalForFirstRoot = await bindWorkspaceMutation(workspace, 'terminal.run', {
      command: 'node',
      args: ['-e', 'process.exit(0)'],
      cwd: 'src'
    })
    let spawnCount = 0
    const terminal = new TerminalManager({
      workspace,
      spawnProcess: () => {
        spawnCount += 1
        throw new Error('terminal must not start')
      }
    })

    await workspace.setRoot(secondRoot)
    await assert.rejects(
      workspace.writeFile(approvedWriteForFirstRoot),
      error => error.code === 'WORKSPACE_IDENTITY_MISMATCH'
    )
    await assert.rejects(
      workspace.applyPatch(approvedForFirstRoot),
      error => error.code === 'WORKSPACE_IDENTITY_MISMATCH'
    )
    await assert.rejects(
      terminal.start(approvedTerminalForFirstRoot),
      error => error.code === 'WORKSPACE_IDENTITY_MISMATCH'
    )
    assert.equal(spawnCount, 0)
    assert.equal(await readFile(path.join(secondRoot, 'src', 'hello.txt'), 'utf8'), before.content)

    await workspace.setRoot(files.root)
    const applied = await workspace.applyPatch(await bindWorkspaceMutation(workspace, 'workspace.patch', {
      path: 'src/hello.txt',
      beforeSha256: before.sha256,
      hunks: [{ startLine: 2, oldLines: ['needle here'], newLines: ['patched'] }]
    }))
    const preparedForFirstRoot = workspace.prepareRevertPatch({ rollbackId: applied.diff.rollbackId })
    await writeFile(path.join(secondRoot, 'src', 'hello.txt'), await readFile(path.join(files.root, 'src', 'hello.txt')))
    await workspace.setRoot(secondRoot)
    await assert.rejects(
      workspace.revertPatch({
        ...preparedForFirstRoot,
        approval: { granted: true, action: 'workspace.revert_patch' }
      }),
      error => error.code === 'WORKSPACE_IDENTITY_MISMATCH'
    )
    assert.equal(
      await readFile(path.join(secondRoot, 'src', 'hello.txt'), 'utf8'),
      'alpha\npatched\nomega\n'
    )
  } finally {
    await rm(files.base, { recursive: true, force: true })
  }
})

test('terminal requires approval, resolves an executable name, bounds output, and supports cancellation', async () => {
  const files = await fixture()
  try {
    const workspace = new WorkspaceManager()
    await workspace.setRoot(files.root)
    const terminal = new TerminalManager({ workspace })

    await assert.rejects(
      terminal.start({ command: 'node', args: ['-e', 'console.log(1)'] }),
      error => error.code === 'APPROVAL_REQUIRED'
    )
    await assert.rejects(
      terminal.start(await bindWorkspaceMutation(workspace, 'terminal.run', {
        command: process.execPath,
        args: []
      })),
      error => error.code === 'INVALID_COMMAND'
    )
    await assert.rejects(
      terminal.start(await bindWorkspaceMutation(workspace, 'terminal.run', {
        command: 'node',
        args: ['-e', 'console.log(1)'],
        cwd: '../outside'
      })),
      error => error.code === 'PATH_OUTSIDE_WORKSPACE'
    )

    const started = await terminal.start(await bindWorkspaceMutation(workspace, 'terminal.run', {
      command: 'node',
      args: ['-e', "process.stdout.write('x'.repeat(5000)); process.stderr.write('done')"],
      cwd: 'src',
      maxOutputBytes: 1024
    }))
    assert.match(started.jobId, /^[0-9a-f-]{36}$/i)
    const completed = await waitForTerminal(terminal, started.jobId)
    assert.equal(completed.status, 'completed')
    assert.equal(completed.cwd, 'src')
    assert.equal(completed.truncated, true)
    assert.ok(Buffer.byteLength(completed.stdout) <= 1024)
    assert.equal(completed.termination.guarantee, 'best_effort')
    assert.equal(completed.termination.descendantsGuaranteed, false)

    const timed = await terminal.start(await bindWorkspaceMutation(workspace, 'terminal.run', {
      command: 'node',
      args: ['-e', 'setInterval(() => {}, 1000)'],
      timeoutMs: 100
    }))
    const timedOut = await waitForTerminal(terminal, timed.jobId)
    assert.equal(timedOut.status, 'timed_out')
    assert.equal(timedOut.timedOut, true)

    const cancellable = await terminal.start(await bindWorkspaceMutation(workspace, 'terminal.run', {
      command: 'node',
      args: ['-e', 'setInterval(() => {}, 1000)']
    }))
    assert.equal(terminal.cancel({ jobId: cancellable.jobId }).status, 'cancelling')
    assert.equal((await waitForTerminal(terminal, cancellable.jobId)).status, 'cancelled')
  } finally {
    await rm(files.base, { recursive: true, force: true })
  }
})

test('terminal shutdown cancels pending starts and never claims an unobserved process exit', async () => {
  let resolveWorkspace
  const fakeBinding = { workspaceRoot: process.cwd(), workspaceGeneration: 1 }
  const approvedTerminalInput = input => ({
    ...input,
    ...fakeBinding,
    approval: { granted: true, action: 'terminal.run' }
  })
  const workspace = {
    root: process.cwd(),
    resolveBound: () => new Promise(resolve => { resolveWorkspace = resolve }),
    assertBinding: () => fakeBinding
  }
  const terminal = new TerminalManager({ workspace })
  const starting = terminal.start(approvedTerminalInput({
    command: 'node',
    args: ['-e', 'console.log(1)']
  }))
  await new Promise(resolve => setImmediate(resolve))
  const stopped = terminal.shutdown()
  assert.equal(stopped.pendingCancelled, 1)
  resolveWorkspace({ path: process.cwd(), ...fakeBinding })
  await assert.rejects(starting, error => error.code === 'COMMAND_START_CANCELLED')
  await assert.rejects(
    terminal.start(approvedTerminalInput({ command: 'node' })),
    error => error.code === 'TERMINAL_SHUTTING_DOWN'
  )

  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const child = new EventEmitter()
  child.pid = 42
  child.stdout = stdout
  child.stderr = stderr
  child.kill = () => true
  const fakeWorkspace = {
    root: process.cwd(),
    resolveBound: async () => ({ path: process.cwd(), ...fakeBinding }),
    assertBinding: () => fakeBinding
  }
  const unconfirmedTerminal = new TerminalManager({
    workspace: fakeWorkspace,
    spawnProcess: () => child,
    killProcess: () => true,
    terminationGraceMs: 5,
    killGraceMs: 2
  })
  const job = await unconfirmedTerminal.start(approvedTerminalInput({ command: 'node' }))
  unconfirmedTerminal.cancel({ jobId: job.jobId })
  const unconfirmed = await waitForTerminal(unconfirmedTerminal, job.jobId)
  assert.equal(unconfirmed.status, 'termination_unconfirmed')
  assert.equal(unconfirmed.termination.unconfirmed, true)
  assert.equal(unconfirmed.termination.directProcessExitObserved, false)
  assert.equal(stdout.destroyed, true)
  assert.equal(stderr.destroyed, true)
  assert.equal(stdout.listenerCount('data'), 0)
  assert.equal(child.listenerCount('close'), 0)
})

test('computer tools require exact approvals and return unavailable capabilities off macOS', async () => {
  const computer = new MacOSComputerTools({ platform: 'win32' })
  assert.equal(computer.getPermissions().reason, 'UNSUPPORTED_PLATFORM')

  await assert.rejects(computer.captureScreen({}), error => error.code === 'APPROVAL_REQUIRED')
  await assert.rejects(
    computer.typeText({ text: 'hello', approval: { granted: true, action: 'computer.click' } }),
    error => error.code === 'APPROVAL_REQUIRED'
  )
  assert.equal((await computer.captureScreen({
    approval: { granted: true, action: 'computer.capture_screen' }
  })).reason, 'UNSUPPORTED_PLATFORM')
  assert.equal((await computer.openApplication({
    application: 'Preview',
    approval: { granted: true, action: 'computer.open_application' }
  })).reason, 'UNSUPPORTED_PLATFORM')
  assert.equal((await computer.click({
    x: 10,
    y: 20,
    approval: { granted: true, action: 'computer.click' }
  })).reason, 'UNSUPPORTED_PLATFORM')
  assert.equal((await computer.typeText({
    text: 'hello',
    approval: { granted: true, action: 'computer.type_text' }
  })).reason, 'UNSUPPORTED_PLATFORM')

  assert.doesNotMatch(CLICK_SCRIPT, /\$\{|shell/i)
  assert.doesNotMatch(TYPE_SCRIPT, /\$\{|shell/i)
})

test('macOS computer actions verify the exact frontmost application before input', async () => {
  let time = 0
  const failedCalls = []
  const mismatched = new MacOSComputerTools({
    platform: 'darwin',
    systemPreferences: { isTrustedAccessibilityClient: () => true },
    runCommand: async (executable, args) => {
      failedCalls.push([executable, args])
      if (args[1] === FRONTMOST_APPLICATION_SCRIPT) return { ok: true, stdout: 'Safari\n' }
      return { ok: true, stdout: '' }
    },
    frontmostTimeoutMs: 100,
    frontmostPollMs: 10,
    now: () => { time += 60; return time },
    sleep: async () => {}
  })
  const refused = await mismatched.click({
    application: 'Preview',
    x: 10,
    y: 20,
    approval: { granted: true, action: 'computer.click' }
  })
  assert.equal(refused.reason, 'FRONTMOST_APPLICATION_MISMATCH')
  assert.equal(refused.expectedApplication, 'Preview')
  assert.equal(failedCalls.some(([, args]) => args[1] === CLICK_SCRIPT), false)

  const successfulCalls = []
  const verified = new MacOSComputerTools({
    platform: 'darwin',
    systemPreferences: { isTrustedAccessibilityClient: () => true },
    runCommand: async (executable, args) => {
      successfulCalls.push([executable, args])
      if (args[1] === FRONTMOST_APPLICATION_SCRIPT) return { ok: true, stdout: 'Preview\n' }
      return { ok: true, stdout: '' }
    }
  })
  const clicked = await verified.click({
    application: 'Preview',
    x: 10,
    y: 20,
    approval: { granted: true, action: 'computer.click' }
  })
  assert.equal(clicked.ok, true)
  assert.equal(successfulCalls.some(([, args]) => args[1] === CLICK_SCRIPT), true)
})

test('native approval canonicalizes and validates the exact payload before display', () => {
  const terminal = canonicalizeAgentToolPayload('terminal.run', {
    command: ' node ',
    args: ['-e', 'console.log(1)'],
    cwd: 'src/../src',
    timeoutMs: 999_999,
    approval: { granted: true, action: 'terminal.run' },
    ignored: 'not forwarded'
  })
  assert.deepEqual(terminal, {
    command: 'node',
    args: ['-e', 'console.log(1)'],
    cwd: 'src',
    timeoutMs: 300_000,
    maxOutputBytes: 1024 * 1024
  })
  assert.equal(Object.isFrozen(terminal), true)
  assert.equal(Object.isFrozen(terminal.args), true)
  assert.match(agentToolApprovalDetail('terminal.run', terminal), /console\.log/)
  const approvalIdentity = {
    workspaceRoot: path.resolve('/tmp/yufeng-workspace'),
    workspaceGeneration: 7
  }
  const boundTerminal = bindWorkspaceApprovalPayload(terminal, approvalIdentity)
  assert.match(agentToolApprovalDetail('terminal.run', boundTerminal), /yufeng-workspace/)
  assert.match(agentToolApprovalDetail('terminal.run', boundTerminal), /工作区世代: 7/)

  const write = canonicalizeAgentToolPayload('workspace.write', {
    path: 'src/../src/file.txt',
    content: 'first line\nsecond line',
    create: true
  })
  const detail = agentToolApprovalDetail('workspace.write', write)
  assert.equal(write.path, path.join('src', 'file.txt'))
  assert.match(detail, /完整内容/)
  assert.match(detail, /first line\\nsecond line/)
  const boundWrite = bindWorkspaceApprovalPayload(write, approvalIdentity)
  assert.match(agentToolApprovalDetail('workspace.write', boundWrite), /yufeng-workspace/)
  assert.match(agentToolApprovalDetail('workspace.write', boundWrite), /工作区世代: 7/)
  assert.throws(() => canonicalizeAgentToolPayload('workspace.write', {
    path: 'src/file.txt',
    content: 'x'.repeat(MAX_NATIVE_WRITE_BYTES + 1)
  }), error => error.code === 'NATIVE_APPROVAL_PREVIEW_TOO_LARGE')
  assert.throws(() => canonicalizeAgentToolPayload('terminal.run', {
    command: 'node',
    args: ['safe\nsecond-command']
  }), error => error.code === 'CONTROL_CHARACTER_FORBIDDEN')
  assert.throws(() => canonicalizeAgentToolPayload('workspace.write', {
    path: `safe\u202Etxt`,
    content: 'safe'
  }), error => error.code === 'BIDI_CONTROL_FORBIDDEN')

  const patch = canonicalizeAgentToolPayload('workspace.patch', {
    path: 'src/../src/file.txt',
    beforeSha256: 'A'.repeat(64),
    hunks: [{ startLine: 3, oldLines: ['old'], newLines: ['new'] }],
    finalNewline: true,
    ignored: 'not forwarded'
  })
  assert.equal(patch.beforeSha256, 'a'.repeat(64))
  assert.equal(Object.isFrozen(patch.hunks[0].newLines), true)
  assert.match(agentToolApprovalDetail('workspace.patch', patch), /"old"/)
  const boundPatch = bindWorkspaceApprovalPayload(patch, approvalIdentity)
  assert.equal(boundPatch.workspaceGeneration, 7)
  assert.equal(Object.isFrozen(boundPatch), true)
  assert.match(agentToolApprovalDetail('workspace.patch', boundPatch), /yufeng-workspace/)
  assert.match(agentToolApprovalDetail('workspace.patch', boundPatch), /工作区世代: 7/)
  assert.ok(MAX_NATIVE_PATCH_BYTES >= Buffer.byteLength(JSON.stringify(patch)))
  assert.throws(() => canonicalizeAgentToolPayload('workspace.patch', {
    path: 'src/file.txt',
    beforeSha256: 'a'.repeat(64),
    hunks: [
      { startLine: 2, oldLines: ['a', 'b'], newLines: ['x'] },
      { startLine: 3, oldLines: ['c'], newLines: ['y'] }
    ]
  }), error => error.code === 'OVERLAPPING_PATCH_HUNKS')

  const revert = canonicalizeAgentToolPayload('workspace.revert_patch', {
    path: 'src/file.txt',
    expectedCurrentSha256: 'b'.repeat(64),
    expectedRevertedSha256: 'a'.repeat(64),
    hunks: [{ startLine: 3, oldLines: ['old'], newLines: ['new'] }],
    finalNewlineBefore: true,
    finalNewlineAfter: false,
    revertsDiffId: 'diff-1'
  })
  assert.equal(revert.revertsDiffId, 'diff-1')
  assert.match(agentToolApprovalDetail('workspace.revert_patch', revert), /回滚目标 SHA-256/)
})

test('agent tools facade requires approval for workspace mutation', async () => {
  const files = await fixture()
  try {
    const tools = createAgentTools({
      userDataPath: files.base,
      tempPath: files.base,
      platform: 'win32'
    })
    await assert.rejects(tools.setWorkspaceRoot({ path: files.root }), error => error.code === 'APPROVAL_REQUIRED')
    const configured = await tools.setWorkspaceRoot({
      path: files.root,
      approval: { granted: true, action: 'workspace.set' }
    })
    assert.equal(configured.ok, true)
    assert.equal((await tools.getCapabilities()).computer.captureScreen, false)
  } finally {
    await rm(files.base, { recursive: true, force: true })
  }
})

test('preload exposes one typed agentTools bridge and every main IPC checks trusted renderer', async () => {
  const preload = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8')
  const main = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8')
  const approval = await readFile(new URL('../electron/agent-tools/approval.cjs', import.meta.url), 'utf8')
  const channels = [
    'get-capabilities', 'get-workspace-root', 'choose-workspace-root', 'set-workspace-root',
    'list-files', 'read-file', 'write-file', 'apply-patch', 'revert-patch', 'search-files', 'start-command', 'get-command', 'cancel-command',
    'get-permissions', 'capture-screen', 'open-application', 'click', 'type-text'
  ]
  assert.match(preload, /agentTools:/)
  assert.match(main, /confirmAgentToolAction/)
  assert.match(main, /attachNativeApproval/)
  assert.match(main, /bindWorkspaceApprovalPayload/)
  assert.match(main, /currentWorkspaceIdentity/)
  assert.match(main, /expectedWorkspaceIdentity/)
  assert.match(main, /prepareRevertPatch\(input\)/)
  assert.match(approval, /nativeConfirmed: true/)
  for (const channel of channels) {
    assert.match(preload, new RegExp(`app:agent-tools:${channel}`))
    const start = main.indexOf(`ipcMain.handle('app:agent-tools:${channel}'`)
    const next = main.indexOf('ipcMain.handle(', start + 1)
    const handler = start >= 0 ? main.slice(start, next >= 0 ? next : start + 1_000) : ''
    assert.match(handler, /requireTrustedRenderer\(event\)/)
  }
})
