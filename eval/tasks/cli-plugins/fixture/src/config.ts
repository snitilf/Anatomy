export function loadConfig(args: string[]) {
  return {
    input: args[0] ?? '',
    to: args[args.indexOf('--to') + 1] ?? 'json',
    pluginDir: process.env.CONVERT_PLUGINS ?? `${process.env.HOME}/.convert/plugins`,
  }
}
