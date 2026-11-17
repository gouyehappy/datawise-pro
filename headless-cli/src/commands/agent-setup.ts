import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import type {Command} from 'commander'

export interface AgentSetupOptions {
    force?: boolean
    target?: string
}

function resolveRepoSkillsDir(): string {
    // headless-cli/src/commands → repo root skills/datawise
    const here = path.dirname(fileURLToPath(import.meta.url))
    return path.resolve(here, '..', '..', '..', 'skills', 'datawise')
}

function defaultTargetDir(): string {
    return path.join(os.homedir(), '.agents', 'skills', 'datawise')
}

/** Allowed roots for --target installs (and subsequent rmSync). */
function allowedInstallRoots(): string[] {
    return [
        path.resolve(path.join(os.homedir(), '.agents', 'skills')),
        path.resolve(process.cwd()),
    ]
}

/**
 * Restrict recursive deletes to a subdirectory under cwd or known agent dirs.
 * Refuses filesystem roots and `..` escapes.
 */
export function assertSafeInstallTarget(destInput: string): string {
    const trimmed = destInput.trim()
    if (!trimmed) {
        throw new Error('--target must not be empty')
    }
    if (trimmed === '/' || /^[A-Za-z]:[\\/]?$/.test(trimmed)) {
        throw new Error('Refusing --target filesystem root')
    }
    if (trimmed.split(/[\\/]/).includes('..')) {
        throw new Error('Refusing --target path that contains ".."')
    }

    const dest = path.resolve(trimmed)
    const root = path.parse(dest).root
    if (dest === root) {
        throw new Error('Refusing --target filesystem root')
    }

    const underAllowed = allowedInstallRoots().some((allowedRoot) => {
        const rel = path.relative(allowedRoot, dest)
        return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
    })
    if (!underAllowed) {
        throw new Error(
            `Refusing --target outside allowed install roots (${allowedInstallRoots().join(', ')}). ` +
                'Use a subdirectory under the current working directory or ~/.agents/skills.',
        )
    }
    return dest
}

function copyDirRecursive(src: string, dest: string): void {
    fs.mkdirSync(dest, {recursive: true})
    for (const entry of fs.readdirSync(src, {withFileTypes: true})) {
        const from = path.join(src, entry.name)
        const to = path.join(dest, entry.name)
        if (entry.isDirectory()) {
            copyDirRecursive(from, to)
        } else if (entry.isFile()) {
            fs.copyFileSync(from, to)
        }
    }
}

function dirHasUserEdits(dest: string, src: string): boolean {
    if (!fs.existsSync(dest)) return false
    const skillDest = path.join(dest, 'SKILL.md')
    const skillSrc = path.join(src, 'SKILL.md')
    if (!fs.existsSync(skillDest) || !fs.existsSync(skillSrc)) return fs.existsSync(dest)
    return fs.readFileSync(skillDest, 'utf8') !== fs.readFileSync(skillSrc, 'utf8')
}

export function registerAgentSetupCommand(program: Command): void {
    const agent = program.command('agent').description('AI agent skill helpers')

    agent
        .command('setup')
        .description('Install the official DataWise Agent Skill into ~/.agents/skills/datawise')
        .option('--force', 'Overwrite a modified Skill directory')
        .option('--target <dir>', 'Install directory (default: ~/.agents/skills/datawise)')
        .action((options: AgentSetupOptions) => {
            const src = resolveRepoSkillsDir()
            if (!fs.existsSync(path.join(src, 'SKILL.md'))) {
                throw new Error(`Skill source not found: ${src}`)
            }
            const dest = options.target?.trim()
                ? assertSafeInstallTarget(options.target)
                : defaultTargetDir()

            if (fs.existsSync(dest) && dirHasUserEdits(dest, src) && !options.force) {
                throw new Error(
                    `Skill at ${dest} was modified. Re-run with --force to overwrite, or pass --target.`,
                )
            }

            fs.rmSync(dest, {recursive: true, force: true})
            copyDirRecursive(src, dest)
            process.stdout.write(`Installed DataWise Agent Skill → ${dest}\n`)
        })

    agent
        .command('doctor')
        .description('Check Skill install path and source')
        .option('--target <dir>', 'Skill directory to check')
        .action((options: {target?: string}) => {
            const src = resolveRepoSkillsDir()
            const dest = options.target?.trim()
                ? assertSafeInstallTarget(options.target)
                : defaultTargetDir()
            const lines = [
                `source: ${src} (${fs.existsSync(path.join(src, 'SKILL.md')) ? 'ok' : 'missing'})`,
                `install: ${dest} (${fs.existsSync(path.join(dest, 'SKILL.md')) ? 'installed' : 'not installed'})`,
            ]
            process.stdout.write(`${lines.join('\n')}\n`)
        })
}
