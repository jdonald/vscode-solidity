'use strict';
import {errorToDiagnostic} from './solErrorsToDiagnostics';
import * as solc from 'solc';
import * as fs from 'fs';
import * as path from 'path';
import {ContractCollection} from './model/contractsCollection';
import { initialiseProject } from './projectService';
import * as child_process from 'child_process';

export enum compilerType {
    localNode,
    Remote,
    localFile,
    default,
}

export class SolcCompiler {

    public rootPath: string;
    public currentCompilerType: compilerType;
    public currentCompilerSetting: string;
    private localSolc: any;

    public getVersion(): string {
        return this.localSolc.version();
    }

    constructor(rootPath: string) {
        this.rootPath = rootPath;
        this.localSolc = null;
        this.currentCompilerType = compilerType.default;
    }

    public isRootPathSet(): boolean {
        return typeof this.rootPath !== 'undefined' && this.rootPath !== null;
    }

    // simple validation to match our settings with the ones passed
    public initialisedAlready(localInstallationPath: string, remoteInstallationVersion: string): boolean {
        // tslint:disable-next-line:curly
        if (this.localSolc === null) return false;

        let installedNodeLocally = false;
        if (this.isRootPathSet()) {
            installedNodeLocally = this.isInstalledSolcUsingNode(this.rootPath);
            if (this.currentCompilerType === compilerType.localNode && installedNodeLocally) {
                return true;
            }
        }

        if (this.currentCompilerType === compilerType.localFile && localInstallationPath === this.currentCompilerSetting) {
            return true;
        }

        if (this.currentCompilerType === compilerType.Remote && localInstallationPath === this.currentCompilerSetting) {
            return true;
        }

        if (this.currentCompilerType === compilerType.default && !installedNodeLocally &&
            (typeof localInstallationPath === 'undefined' || localInstallationPath === null) &&
            (typeof remoteInstallationVersion === 'undefined' || remoteInstallationVersion === null)) {
                return true;
        }

        return false;
    }

    public intialiseCompiler(localInstallationPath: string, remoteInstallationVersion: string): Promise<void> {
            return new Promise<void> ((resolve, reject) => {
            try {
                if (this.initialisedAlready(localInstallationPath, remoteInstallationVersion)) {
                    resolve();
                }
                let solidityfile = '';
                if (this.isInstalledSolcUsingNode(this.rootPath)) {
                    solidityfile = require(this.getLocalSolcNodeInstallation());
                    this.localSolc = solc.setupMethods(solidityfile);
                    this.currentCompilerType = compilerType.localNode;
                    this.currentCompilerSetting = null;
                    resolve();
                } else {
                    // local file
                    if (typeof localInstallationPath !== 'undefined' && localInstallationPath !== null) {
                        solidityfile = require(localInstallationPath);
                        this.localSolc = solc.setupMethods(solidityfile);
                        this.currentCompilerType = compilerType.localFile;
                        this.currentCompilerSetting = localInstallationPath;
                        resolve();
                    } else {
                        // remote
                        if (typeof remoteInstallationVersion !== 'undefined' && remoteInstallationVersion !== null) {
                            const solcService = this;
                            solc.loadRemoteVersion(remoteInstallationVersion, function(err, solcSnapshot) {
                                if (err) {
                                        reject('There was an error loading the remote version: ' + remoteInstallationVersion);
                                } else {
                                    solcService.currentCompilerType = compilerType.Remote;
                                    solcService.currentCompilerSetting = remoteInstallationVersion;
                                    solcService.localSolc = solcSnapshot;
                                    resolve();
                                }
                            });
                        // default
                        } else {
                            this.localSolc = require('solc');
                            this.currentCompilerType = compilerType.default;
                            this.currentCompilerSetting = null;
                            resolve();
                        }
                    }
                }
            } catch (error) {
                reject(error);
            }
            } );
    }

    public getLocalSolcNodeInstallation() {
        return path.join(this.rootPath, 'node_modules', 'solc', 'soljson.js');
    }

    public isInstalledSolcUsingNode(rootPath: string): boolean {
        return fs.existsSync(this.getLocalSolcNodeInstallation());
    }


    public compile(contracts: any) {
        return this.localSolc.compile(contracts);
    }

    public loadRemoteVersion(remoteCompiler: any, cb: any) {
        solc.loadRemoteVersion(remoteCompiler, cb);
    }

    public compileSolidityDocumentAndGetDiagnosticErrors(filePath: string, documentText: string,
                packageDefaultDependenciesDirectory: string, packageDefaultDependenciesContractsDirectory: string ) {
        if (this.isRootPathSet()) {
            const contracts = new ContractCollection();
            contracts.addContractAndResolveImports(
                filePath,
                documentText,
                initialiseProject(this.rootPath, packageDefaultDependenciesDirectory, packageDefaultDependenciesContractsDirectory));
            const contractsForCompilation = contracts.getContractsForCompilation();
            contractsForCompilation.settings = null;
            const outputString = this.compile(JSON.stringify(contractsForCompilation));
            const k = Object.keys(contractsForCompilation.sources);
            var addon = [];
            if (k.length == 1) {
                try {
                    const a = k[0];
                    var foo  = child_process.execSync('/usr/local/bin/solc --asm --gas ' + a).toString();;
                    const lines = foo.split('\n');
                    var started = false;
                    var m = {}
                    for (let line of lines) {
                        if (started) {
                            if (line.match(/\(/)) {
                                const results = line.match(/^ *(.*)\(.*\):\s*(.*)$/);
                                if (results && results.length == 3) {
                                    const funcName = results[1];
                                    const gasAmount = parseInt(results[2], 10);
                                    m[funcName] = gasAmount;
                                }
                            }
                        } else if (line == 'Gas estimation:') {
                            started = true;
                        }
                    }
                    if (started) {
                        var funcLocations = {}
                        const filecontent = fs.readFileSync(a, 'utf8');
                        const filelines = filecontent.split('\n');
                        var counter = 1;
                        for (let mykey in filelines) {
                            const line = filelines[mykey];
                            if (line.match(/function /)) {
                                for (let funcName of Object.keys(m)) {
                                    const re = "function.*" + funcName;
                                    if (line.match(re)) {
                                        funcLocations[funcName] = counter;
                                    }
                                }
                            }
                            counter += 1;
                        }
                        for (let line of lines) {
                            if (line.match(/function /)) {
                                for (let funcName of Object.keys(m)) {
                                    const re = ":.*:.*function " + funcName;
                                    if (line.match(re)) {
                                        const colon_split = line.split(':');
                                        addon.push({
                                            component: 'general',
                                            formattedMessage: a + ':' + (funcLocations[funcName] || '50') + ':1:' + funcName + ' *Gas estimate*: ' + m[funcName],
                                            message: funcName + ' gas estimate: ' + m[funcName],
                                            severity: 'warning',
                                            sourceLocation: { end: parseInt(colon_split[2], 10) + parseInt(colon_split[1], 10), start: parseInt(colon_split[1], 10), file: a },
                                            type: 'Warning'
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
                catch(e) {}
            }
            const output = JSON.parse(outputString);
            if (output.errors) {
                return (output
                    .errors).concat(addon)
                    .map(error => errorToDiagnostic(error));
            }
        } else {
            const contract = {};
            contract[filePath] = documentText;
            const output = this.compile({sources: contract });
            if (output.errors) {
                return output.errors.map((error) => errorToDiagnostic(error));
            }
        }
        return [];
    }
}
