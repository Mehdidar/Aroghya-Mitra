// Monorepo Metro config: the app imports packages/* (@am/shared, @am/patient-ai, @am/records) and
// server/* types, so Metro watches the repo root and resolves modules from both node_modules trees.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), path.resolve(workspaceRoot, 'node_modules')];
// Only one copy of react / react-native may be loaded: always the app's.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
