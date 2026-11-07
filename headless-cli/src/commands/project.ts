import type {Command} from 'commander'
import {DatawiseClient} from '../client.js'
import {resolveConfig} from '../config.js'

export function registerProjectCommand(program: Command): void {
    const project = program.command('project').description('Application project scope (in-app)')

    project
        .command('list')
        .description('List projects')
        .option('--json', 'Print raw JSON')
        .option('--archived', 'Include archived projects')
        .action(async (options: {json?: boolean; archived?: boolean}, command: Command) => {
            const client = new DatawiseClient(resolveConfig(command))
            const projects = await client.listProjects(Boolean(options.archived))
            if (options.json) {
                process.stdout.write(`${JSON.stringify(projects, null, 2)}\n`)
                return
            }
            for (const item of projects) {
                const tags = [
                    item.isDefault ? 'default' : null,
                    item.archived ? 'archived' : null,
                ].filter(Boolean).join(',')
                process.stdout.write(`${item.id}\t${item.name}${tags ? `\t${tags}` : ''}\n`)
            }
        })

    project
        .command('use')
        .description('Set active project')
        .argument('<projectId>', 'Project id (e.g. proj_default)')
        .option('--json', 'Print raw JSON')
        .action(async (projectId: string, options: {json?: boolean}, command: Command) => {
            const client = new DatawiseClient(resolveConfig(command))
            const active = await client.setActiveProject(projectId)
            if (options.json) {
                process.stdout.write(`${JSON.stringify(active, null, 2)}\n`)
                return
            }
            process.stdout.write(`active\t${active.projectId}\t${active.project.name}\n`)
        })

    project
        .command('create')
        .description('Create a project')
        .argument('<name>', 'Project display name')
        .option('--color <key>', 'Optional color key')
        .option('--description <text>', 'Optional description')
        .option('--use', 'Switch to the new project after create')
        .option('--json', 'Print raw JSON')
        .action(async (
            name: string,
            options: {color?: string; description?: string; use?: boolean; json?: boolean},
            command: Command,
        ) => {
            const client = new DatawiseClient(resolveConfig(command))
            const created = await client.createProject({
                name,
                colorKey: options.color,
                description: options.description,
            })
            if (options.use) {
                await client.setActiveProject(created.id)
            }
            if (options.json) {
                process.stdout.write(`${JSON.stringify(created, null, 2)}\n`)
                return
            }
            process.stdout.write(`created\t${created.id}\t${created.name}${options.use ? '\tactive' : ''}\n`)
        })
}
