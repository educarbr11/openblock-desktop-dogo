const fs = require('fs');
const https = require('https');
const path = require('path');
const util = require('util');

const async = require('async');

const libraries = require('./lib/libraries');

const ASSET_HOST = process.env.DOGOBLOCK_ASSET_HOST || 'https://dogoblockcdn.dogomaker.com';
const NUM_SIMULTANEOUS_DOWNLOADS = 5;
const OUT_PATH = path.resolve('static', 'assets');


const describe = function (object) {
    return util.inspect(object, false, Infinity, true);
};

const collectSimple = function (library, dest, debugLabel = 'Item') {
    library.forEach(item => {
        let md5Count = 0;
        if (item.md5) {
            ++md5Count;
            dest.add(item.md5);
        }
        if (item.baseLayerMD5) { // 2.0 library syntax for costumes
            ++md5Count;
            dest.add(item.baseLayerMD5);
        }
        if (item.md5ext) { // 3.0 library syntax for costumes
            ++md5Count;
            dest.add(item.md5ext);
        }
        if (md5Count < 1) {
            console.warn(`${debugLabel} has no MD5 property:\n${describe(item)}`);
        } else if (md5Count > 1) {
            // is this actually bad?
            console.warn(`${debugLabel} has multiple MD5 properties:\n${describe(item)}`);
        }
    });
    return dest;
};

const collectAssets = function (dest) {
    collectSimple(libraries.backdrops, dest, 'Backdrop');
    collectSimple(libraries.costumes, dest, 'Costume');
    collectSimple(libraries.sounds, dest, 'Sound');
    libraries.sprites.forEach(sprite => {
        if (sprite.costumes) {
            collectSimple(sprite.costumes, dest, `Costume for sprite ${sprite.name}`);
        }
        if (sprite.sounds) {
            collectSimple(sprite.sounds, dest, `Sound for sprite ${sprite.name}`);
        }
    });
    return dest;
};

const connectionPool = [];

const fetchAsset = function (md5, callback) {
    const target = path.resolve(OUT_PATH, md5);
    if (fs.existsSync(target) && fs.statSync(target).size > 0) {
        callback();
        return;
    }

    const myAgent = connectionPool.pop() || new https.Agent({keepAlive: true});
    const assetUrl = new URL(`/${md5}`, ASSET_HOST);
    const temporaryTarget = `${target}.download`;
    let completed = false;
    const fail = error => {
        if (completed) return;
        completed = true;
        fs.rmSync(temporaryTarget, {force: true});
        myAgent.destroy();
        callback(error);
    };

    https.get(assetUrl, {agent: myAgent}, response => {
        if (response.statusCode !== 200) {
            response.resume();
            fail(new Error(`Request failed: status code ${response.statusCode} for ${assetUrl}`));
            return;
        }

        const stream = fs.createWriteStream(temporaryTarget, {encoding: 'binary'});
        stream.on('error', fail);
        response.on('error', fail);
        stream.on('finish', () => {
            stream.close(() => {
                if (completed) return;
                try {
                    fs.renameSync(temporaryTarget, target);
                    completed = true;
                    connectionPool.push(myAgent);
                    console.log(`Fetched ${assetUrl}`);
                    callback();
                } catch (error) {
                    fail(error);
                }
            });
        });
        response.pipe(stream);
    }).on('error', fail);
};

const fetchAllAssets = function () {
    fs.mkdirSync(OUT_PATH, {recursive: true});
    const allAssets = collectAssets(new Set());
    console.log(`Total library assets: ${allAssets.size}`);

    async.forEachLimit(allAssets, NUM_SIMULTANEOUS_DOWNLOADS, fetchAsset, err => {
        if (err) {
            console.error(`Fetch failed:\n${describe(err)}`);
            process.exitCode = 1;
        } else {
            console.log('Fetch succeeded.');
        }

        console.log(`Shutting down ${connectionPool.length} agents.`);
        while (connectionPool.length > 0) {
            connectionPool.pop().destroy();
        }
    });
};

fetchAllAssets();
