import { loadConfig } from './config.ts'
import { loadPlugins } from './plugins/loader.ts'
import { convert } from './convert.ts'

const config = loadConfig(process.argv.slice(2))
const plugins = await loadPlugins(config.pluginDir)
process.stdout.write(await convert(config.input, config.to, plugins))
