import {app} from 'electron';
import path from 'path';
import os from 'os';
import {execFile, spawn} from 'child_process';
import EventEmitter from 'events';
import fs from 'fs-extra';

import sudo from 'sudo-prompt';
import {productName} from '../../package.json';
import log from '../common/log';

import OpenBlockLink from 'openblock-link';
import OpenblockResourceServer from 'openblock-resource';

export const DESKTOP_LINK_PORT = 20113;
export const DESKTOP_LINK_HOST = '127.0.0.1';

class OpenblockDesktopLink extends EventEmitter {
    constructor () {
        super();

        this._resourceServer = null;

        this.appPath = app.getAppPath();
        if (this.appPath.search(/app/g) !== -1) {
            // Normal app
            this.appPath = path.join(this.appPath, '../../');
        } else if (this.appPath.search(/main/g) !== -1) { // eslint-disable-line no-negated-condition
            // Start by start script in debug mode.
            this.appPath = path.join(this.appPath, '../../');
        } else {
            // App in dir mode
            this.appPath = path.join(this.appPath, '../');
        }

        const userDataPath = app.getPath(
            'userData'
        );
        this.dataPath = path.join(userDataPath, 'Data');

        const cacheResourcesPath = path.join(this.dataPath, 'external-resources');
        if (!fs.existsSync(cacheResourcesPath)) {
            fs.mkdirSync(cacheResourcesPath, {recursive: true});
        }

        this._link = new OpenBlockLink(this.dataPath, path.join(this.appPath, 'tools'));
        this._link.on('error', message => {
            log.error(message);
            this.emit('link-error', message);
        });
        this._link.on('port-in-use', () => {
            const message = `The local hardware server port ${DESKTOP_LINK_PORT} is already used by another ` +
                'DoGoBlock Link instance.';
            log.warn(message);
            this.emit('link-warning', message);
        });
        this._resourceServer = new OpenblockResourceServer(cacheResourcesPath,
            path.join(this.appPath, 'external-resources'),
            app.getLocaleCountryCode());
    }

    get resourceServer () {
        return this._resourceServer;
    }

    installDriver (callback = null) {
        const driverPath = path.join(this.appPath, 'drivers');
        if ((os.platform() === 'win32') && (os.arch() === 'x64')) {
            execFile('install_x64.bat', [], {cwd: driverPath});
        } else if ((os.platform() === 'win32') && (os.arch() === 'ia32')) {
            execFile('install_x86.bat', [], {cwd: driverPath});
        } else if ((os.platform() === 'darwin')) {
            spawn('sh', ['install.sh'], {shell: true, cwd: driverPath});
        } else if ((os.platform() === 'linux')) {
            sudo.exec(`sh ${path.join(driverPath, 'linux_setup.sh')} yang`, {name: productName},
                error => {
                    if (error) throw error;
                    if (callback) {
                        callback();
                    }
                }
            );
        }
    }

    clearCache (reboot = true) {
        if (fs.existsSync(this.dataPath)) {
            fs.rmSync(this.dataPath, {recursive: true, force: true});
        }
        if (reboot){
            app.relaunch();
            app.exit();
        }
    }

    start () {
        this._link.listen(DESKTOP_LINK_PORT, DESKTOP_LINK_HOST);

        // start resource server
        this._resourceServer.listen();
    }
}

export default OpenblockDesktopLink;
