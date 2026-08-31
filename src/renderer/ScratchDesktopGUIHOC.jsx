import {ipcRenderer, clipboard} from 'electron';
import {dialog} from '@electron/remote';
import * as remote from '@electron/remote/renderer';
import bindAll from 'lodash.bindall';
import omit from 'lodash.omit';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import GUIComponent from 'openblock-gui/src/components/gui/gui.jsx';
import ResourcePackModal from 'openblock-gui/src/components/resource-pack-modal/resource-pack-modal.jsx';
import {FormattedMessage} from 'react-intl';

import {
    LoadingStates,
    onFetchedProjectData,
    onLoadedProject,
    defaultProjectId,
    requestNewProject,
    requestProjectUpload,
    setProjectId
} from 'openblock-gui/src/reducers/project-state';
import {
    openLoadingProject,
    closeLoadingProject,
    openTelemetryModal,
    openUpdateModal
} from 'openblock-gui/src/reducers/modals';
import {setUpdate} from 'openblock-gui/src/reducers/update';
import {setDeviceData} from 'openblock-gui/src/reducers/device-data';

import analytics, {initialAnalytics} from 'openblock-gui/src/lib/analytics';
import MessageBoxType from 'openblock-gui/src/lib/message-box.js';
import {makeDeviceLibrary} from 'openblock-gui/src//lib/libraries/devices/index.jsx';

import ElectronStorageHelper from '../common/ElectronStorageHelper';

import showPrivacyPolicy from './showPrivacyPolicy';

/**
 * Higher-order component to add desktop logic to the GUI.
 * @param {Component} WrappedComponent - a GUI-like component to wrap.
 * @returns {Component} - a component similar to GUI with desktop-specific logic added.
 */
const ScratchDesktopGUIHOC = function (WrappedComponent) {
    class ScratchDesktopGUIComponent extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'handleCancelResourcePack',
                'handleEnsureResourcePack',
                'handleGetResourcePackStatus',
                'handleInstallResourcePack',
                'handleProjectTelemetryEvent',
                'handleRemoveResourcePack',
                'handleResourcePackProgress',
                'handleSetTitleFromSave',
                'handleShowMessageBox',
                'handleStorageInit',
                'handleUseInstalledResourcePack',
                'handleUpdateProjectTitle'
            ]);
            this.state = {
                resourcePackStatus: null
            };
            this.pendingResourcePack = null;
            this.props.onLoadingStarted();
            ipcRenderer.invoke('get-initial-project-data').then(async initialProjectData => {
                const hasInitialProject = initialProjectData && (initialProjectData.length > 0);
                this.props.onHasInitialProject(hasInitialProject, this.props.loadingState);
                if (!hasInitialProject) {
                    this.props.onLoadingCompleted();
                    ipcRenderer.send('loading-completed');
                    return;
                }
                // Update device list
                await this.props.vm.extensionManager.getDeviceList().then(data => {
                    this.props.onSetDeviceData(makeDeviceLibrary(data));
                })
                    .catch(() => {
                        this.props.onSetDeviceData(makeDeviceLibrary());
                    });
                this.props.vm.loadProject(initialProjectData).then(
                    () => {
                        this.props.onLoadingCompleted();
                        ipcRenderer.send('loading-completed');
                        this.props.onLoadedProject(this.props.loadingState, true);
                    },
                    e => {
                        this.props.onLoadingCompleted();
                        ipcRenderer.send('loading-completed');
                        this.props.onLoadedProject(this.props.loadingState, false);
                        dialog.showMessageBox(remote.getCurrentWindow(), {
                            type: 'error',
                            title: 'Failed to load project',
                            message: 'Invalid or corrupt project file.',
                            detail: e.message
                        });

                        // this effectively sets the default project ID
                        // TODO: maybe setting the default project ID should be implicit in `requestNewProject`
                        this.props.onHasInitialProject(false, this.props.loadingState);

                        // restart as if we didn't have an initial project to load
                        this.props.onRequestNewProject();
                    }
                );
            });
            ipcRenderer.send('set-locale', this.props.locale);
        }
        componentDidMount () {
            // replace navigator.clipboard.readText to Electron's clipboard.readText
            navigator.clipboard.readText = () => Promise.resolve(clipboard.readText());

            ipcRenderer.on('setTitleFromSave', this.handleSetTitleFromSave);
            ipcRenderer.on('setUpdate', (event, args) => {
                this.props.onSetUpdate(args);
            });
            ipcRenderer.on('setUserId', (event, args) => {
                initialAnalytics(args);
                // Register "base" page view
                analytics.send({hitType: 'pageview', page: '/community/electron'});
            });
            ipcRenderer.on('setPlatform', (event, args) => {
                this.platform = args;
            });
            ipcRenderer.on('resource-pack:progress', this.handleResourcePackProgress);
        }
        componentWillUnmount () {
            ipcRenderer.removeListener('setTitleFromSave', this.handleSetTitleFromSave);
            ipcRenderer.removeListener('resource-pack:progress', this.handleResourcePackProgress);
            if (this.pendingResourcePack) {
                this.pendingResourcePack.reject(new Error('Resource pack request was interrupted.'));
                this.pendingResourcePack = null;
            }
        }
        handleClickAbout () {
            ipcRenderer.send('open-about-window');
        }
        handleClickLicense () {
            ipcRenderer.send('open-license-window');
        }
        handleClickCheckUpdate () {
            ipcRenderer.send('reqeustCheckUpdate');
        }
        handleClickUpdate () {
            ipcRenderer.send('reqeustUpdate');
        }
        handleAbortUpdate () {
            ipcRenderer.send('abortUpdate');
        }
        handleClickClearCache () {
            ipcRenderer.send('clearCache');
        }
        handleClickInstallDriver () {
            ipcRenderer.send('installDriver');
        }
        handleProjectTelemetryEvent (event, metadata) {
            ipcRenderer.send(event, metadata);
        }
        handleGetResourcePackStatus (packId) {
            return ipcRenderer.invoke('resource-pack:get-status', packId);
        }
        handleEnsureResourcePack (packId) {
            if (this.pendingResourcePack && this.pendingResourcePack.packId === packId) {
                return this.pendingResourcePack.promise;
            }
            return this.handleGetResourcePackStatus(packId).then(status => {
                if (status.phase === 'ready' && status.canUse) return status;

                let resolveRequest;
                let rejectRequest;
                const promise = new Promise((resolve, reject) => {
                    resolveRequest = resolve;
                    rejectRequest = reject;
                });
                this.pendingResourcePack = {
                    packId,
                    promise,
                    resolve: resolveRequest,
                    reject: rejectRequest
                };
                this.setState({resourcePackStatus: status});
                return promise;
            });
        }
        handleInstallResourcePack () {
            if (!this.pendingResourcePack) return;
            const packId = this.pendingResourcePack.packId;
            this.setState({
                resourcePackStatus: Object.assign({}, this.state.resourcePackStatus, {
                    phase: 'downloading',
                    progress: 0
                })
            });
            ipcRenderer.invoke('resource-pack:install', packId).then(status => {
                if (!this.pendingResourcePack || this.pendingResourcePack.packId !== packId) return;
                const pending = this.pendingResourcePack;
                this.pendingResourcePack = null;
                this.setState({resourcePackStatus: null});
                pending.resolve(status);
            })
                .catch(error => {
                    if (!this.pendingResourcePack || this.pendingResourcePack.packId !== packId) return;
                    this.setState({
                        resourcePackStatus: Object.assign({}, this.state.resourcePackStatus, {
                            phase: 'error',
                            progress: 0,
                            message: error.message
                        })
                    });
                });
        }
        handleCancelResourcePack () {
            if (!this.pendingResourcePack) return;
            const pending = this.pendingResourcePack;
            const status = this.state.resourcePackStatus || {};
            this.pendingResourcePack = null;
            this.setState({resourcePackStatus: null});
            if (['downloading', 'extracting', 'validating'].indexOf(status.phase) !== -1) {
                ipcRenderer.invoke('resource-pack:cancel', pending.packId).catch(() => {});
            }
            pending.reject(new Error('Resource pack installation was cancelled.'));
        }
        handleUseInstalledResourcePack () {
            if (!this.pendingResourcePack || !this.state.resourcePackStatus ||
                !this.state.resourcePackStatus.canUse) return;
            const pending = this.pendingResourcePack;
            const status = this.state.resourcePackStatus;
            this.pendingResourcePack = null;
            this.setState({resourcePackStatus: null});
            pending.resolve(status);
        }
        handleResourcePackProgress (event, status) {
            if (!this.pendingResourcePack || status.id !== this.pendingResourcePack.packId) return;
            this.setState({resourcePackStatus: status});
        }
        handleRemoveResourcePack (packId) {
            const isPortuguese = this.props.locale.indexOf('pt') === 0;
            const copy = isPortuguese ? {
                remove: 'Remover',
                cancel: 'Cancelar',
                title: 'Remover suporte ESP32',
                message: 'Remover o suporte ESP32 deste computador?',
                detail: 'Seus projetos e blocos não serão apagados. Para usar ESP32 novamente, será necessário ' +
                    'baixar o pacote.'
            } : {
                remove: 'Remove',
                cancel: 'Cancel',
                title: 'Remove ESP32 support',
                message: 'Remove ESP32 support from this computer?',
                detail: 'Your projects and blocks will not be deleted. To use ESP32 again, download the package.'
            };
            return dialog.showMessageBox(remote.getCurrentWindow(), {
                type: 'warning',
                buttons: [copy.remove, copy.cancel],
                defaultId: 1,
                cancelId: 1,
                title: copy.title,
                message: copy.message,
                detail: copy.detail
            }).then(result => {
                if (result.response !== 0) {
                    return Promise.reject(new Error('Resource pack removal was cancelled.'));
                }
                return ipcRenderer.invoke('resource-pack:remove', packId);
            });
        }
        handleSetTitleFromSave (event, args) {
            this.handleUpdateProjectTitle(args.title);
        }
        handleStorageInit (storageInstance) {
            storageInstance.addHelper(new ElectronStorageHelper(storageInstance));
        }
        handleUpdateProjectTitle (newTitle) {
            this.setState({projectTitle: newTitle});
        }
        handleShowMessageBox (type, message) {
            /**
             * To avoid the electron bug: the input-box lose focus after call alert or confirm on windows platform.
             * https://github.com/electron/electron/issues/19977
            */
            if (this.platform === 'win32') {
                let options;
                if (type === MessageBoxType.confirm) {
                    options = {
                        type: 'warning',
                        buttons: ['Ok', 'Cancel'],
                        message: message
                    };
                } else if (type === MessageBoxType.alert) {
                    options = {
                        type: 'error',
                        message: message
                    };
                }
                const result = dialog.showMessageBoxSync(remote.getCurrentWindow(), options);
                if (result === 0) {
                    return true;
                }
                return false;
            }
            if (type === 'confirm') {
                return confirm(message); // eslint-disable-line no-alert
            }
            return alert(message); // eslint-disable-line no-alert
        }
        render () {
            const childProps = omit(this.props, Object.keys(ScratchDesktopGUIComponent.propTypes));

            return (
                <React.Fragment>
                    <WrappedComponent
                        canChangeLanguage
                        canEditTitle
                        canModifyCloudData={false}
                        canSave={false}
                        isScratchDesktop
                        onClickAbout={[
                            {
                                title: (<FormattedMessage
                                    defaultMessage="About"
                                    description="Menu bar item for about"
                                    id="gui.desktopMenuBar.about"
                                />),
                                onClick: () => this.handleClickAbout()
                            },
                            {
                                title: (<FormattedMessage
                                    defaultMessage="License"
                                    description="Menu bar item for license"
                                    id="gui.desktopMenuBar.license"
                                />),
                                onClick: () => this.handleClickLicense()
                            },
                            {
                                title: (<FormattedMessage
                                    defaultMessage="Privacy policy"
                                    description="Menu bar item for privacy policy"
                                    id="gui.menuBar.privacyPolicy"
                                />),
                                onClick: () => showPrivacyPolicy()
                            },
                            {
                                title: (<FormattedMessage
                                    defaultMessage="Data settings"
                                    description="Menu bar item for data settings"
                                    id="gui.menuBar.dataSettings"
                                />),
                                onClick: () => this.props.onTelemetrySettingsClicked()
                            }
                        ]}
                        onClickLogo={this.handleClickLogo}
                        onClickCheckUpdate={this.handleClickCheckUpdate}
                        onClickUpdate={this.handleClickUpdate}
                        onAbortUpdate={this.handleAbortUpdate}
                        onClickInstallDriver={this.handleClickInstallDriver}
                        onClickClearCache={this.handleClickClearCache}
                        onEnsureResourcePack={this.handleEnsureResourcePack}
                        onGetResourcePackStatus={this.handleGetResourcePackStatus}
                        onProjectTelemetryEvent={this.handleProjectTelemetryEvent}
                        onRemoveResourcePack={this.handleRemoveResourcePack}
                        onShowMessageBox={this.handleShowMessageBox}
                        onShowPrivacyPolicy={showPrivacyPolicy}
                        onStorageInit={this.handleStorageInit}
                        onUpdateProjectTitle={this.handleUpdateProjectTitle}

                        // allow passed-in props to override any of the above
                        {...childProps}
                    />
                    {this.state.resourcePackStatus ? (
                        <ResourcePackModal
                            status={this.state.resourcePackStatus}
                            onCancel={this.handleCancelResourcePack}
                            onInstall={this.handleInstallResourcePack}
                            onUseInstalled={this.handleUseInstalledResourcePack}
                        />
                    ) : null}
                </React.Fragment>
            );
        }
    }

    ScratchDesktopGUIComponent.propTypes = {
        loadingState: PropTypes.oneOf(LoadingStates),
        locale: PropTypes.string.isRequired,
        onFetchedInitialProjectData: PropTypes.func,
        onHasInitialProject: PropTypes.func,
        onLoadedProject: PropTypes.func,
        onLoadingCompleted: PropTypes.func,
        onLoadingStarted: PropTypes.func,
        onRequestNewProject: PropTypes.func,
        onTelemetrySettingsClicked: PropTypes.func,
        onSetDeviceData: PropTypes.func.isRequired,
        onSetUpdate: PropTypes.func,
        // using PropTypes.instanceOf(VM) here will cause prop type warnings due to VM mismatch
        vm: GUIComponent.WrappedComponent.propTypes.vm
    };
    const mapStateToProps = state => {
        const loadingState = state.scratchGui.projectState.loadingState;
        return {
            loadingState: loadingState,
            locale: state.locales.locale,
            vm: state.scratchGui.vm
        };
    };
    const mapDispatchToProps = dispatch => ({
        onLoadingStarted: () => dispatch(openLoadingProject()),
        onLoadingCompleted: () => dispatch(closeLoadingProject()),
        onHasInitialProject: (hasInitialProject, loadingState) => {
            if (hasInitialProject) {
                // emulate sb-file-uploader
                return dispatch(requestProjectUpload(loadingState));
            }

            // `createProject()` might seem more appropriate but it's not a valid state transition here
            // setting the default project ID is a valid transition from NOT_LOADED and acts like "create new"
            return dispatch(setProjectId(defaultProjectId));
        },
        onFetchedInitialProjectData: (projectData, loadingState) =>
            dispatch(onFetchedProjectData(projectData, loadingState)),
        onLoadedProject: (loadingState, loadSuccess) => {
            const canSaveToServer = false;
            return dispatch(onLoadedProject(loadingState, canSaveToServer, loadSuccess));
        },
        onRequestNewProject: () => dispatch(requestNewProject(false)),
        onSetDeviceData: data => dispatch(setDeviceData(data)),
        onSetUpdate: arg => {
            dispatch(setUpdate(arg));
            dispatch(openUpdateModal());
        },
        onTelemetrySettingsClicked: () => dispatch(openTelemetryModal())
    });

    return connect(mapStateToProps, mapDispatchToProps)(ScratchDesktopGUIComponent);
};

export default ScratchDesktopGUIHOC;
