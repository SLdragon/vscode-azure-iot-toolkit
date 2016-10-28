'use strict';
import * as vscode from 'vscode';
import { Utility } from './utility';
import { clientFromConnectionString } from 'azure-iot-device-http';
import { Message, Client } from 'azure-iot-device';
import { AppInsightsClient } from './appInsightsClient';
let EventHubClient = require('azure-event-hubs').Client;


export class MessageExplorer {
    private _outputChannel: vscode.OutputChannel;
    private _appInsightsClient: AppInsightsClient;
    private _eventHubClient;

    constructor(outputChannel: vscode.OutputChannel, appInsightsClient: AppInsightsClient) {
        this._outputChannel = outputChannel;
        this._appInsightsClient = appInsightsClient;
    }

    public sendD2CMessage(): void {
        let label = 'D2CMessage';
        let config = Utility.getConfiguration();
        let deviceConnectionString = config.get<string>('deviceConnectionString');
        if (!deviceConnectionString || deviceConnectionString.startsWith('<<insert')) {
            vscode.window.showErrorMessage('Please set your Device Connection String in settings.json');
            return;
        }

        vscode.window.showInputBox({ prompt: 'Enter message to send' }).then((message: string) => {
            if (message !== undefined) {
                try {
                    let client = clientFromConnectionString(deviceConnectionString);
                    client.sendEvent(new Message(JSON.stringify(message)), this.sendEventDone(true, client, label));
                }
                catch (e) {
                    Utility.output(this._outputChannel, label, e);
                }
            }
        });
    }

    public startMonitoringMessage(): void {
        let label = 'Monitor';
        let config = Utility.getConfiguration();
        let iotHubConnectionString = config.get<string>('iotHubConnectionString');
        if (!iotHubConnectionString || iotHubConnectionString.startsWith('<<insert')) {
            vscode.window.showErrorMessage('Please set your IoT Hub Connection String in settings.json');
            return;
        }
        let consumerGroup = config.get<string>('consumerGroup');

        try {
            this._eventHubClient = EventHubClient.fromConnectionString(iotHubConnectionString);
            this._outputChannel.show();
            Utility.output(this._outputChannel, label, 'Start monitoring...');
            this._appInsightsClient.sendEvent('D2C.startMonitoring')
            this._eventHubClient.open()
                .then(this._eventHubClient.getPartitionIds.bind(this._eventHubClient))
                .then((partitionIds) => {
                    return partitionIds.map((partitionId) => {
                        return this._eventHubClient.createReceiver(consumerGroup, partitionId, { 'startAfterTime': Date.now() }).then((receiver) => {
                            Utility.output(this._outputChannel, label, `Created partition receiver [${partitionId}] for consumerGroup [${consumerGroup}]`);
                            receiver.on('errorReceived', this.printError(this._outputChannel, label, this._eventHubClient));
                            receiver.on('message', this.printMessage(this._outputChannel, label));
                        });
                    });
                })
                .catch(this.printError(this._outputChannel, label, this._eventHubClient));
        }
        catch (e) {
            Utility.output(this._outputChannel, label, e);
        }
    }

    public stopMonitoringMessage(): void {
        if (this._eventHubClient) {
            Utility.output(this._outputChannel, 'Monitor', 'Stop monitoring...');
            this._appInsightsClient.sendEvent('D2C.stopMonitoring')
            this._eventHubClient.close();
        }
    }

    private sendEventDone(close: boolean, client: Client, label: string) {
        this._outputChannel.show();
        Utility.output(this._outputChannel, label, 'Sending message to IoT Hub...');

        return (err, result) => {
            if (err) {
                Utility.output(this._outputChannel, label, 'Failed to send message to IoT Hub');
                Utility.output(this._outputChannel, label, err.toString());
                this._appInsightsClient.sendEvent('D2C.Send', { Result: 'Fail' })
            }
            if (result) {
                Utility.output(this._outputChannel, label, '[Success] Message sent to IoT Hub');
                this._appInsightsClient.sendEvent('D2C.Send', { Result: 'Success' })
            }
            if (close) {
                client.close((err, result) => { console.log('client close') });
            }
        };
    }

    private printError(outputChannel: vscode.OutputChannel, label: string, eventHubClient) {
        return (err) => {
            Utility.output(this._outputChannel, label, err.message);
            Utility.output(this._outputChannel, label, 'Stop monitoring...');
            if (eventHubClient) {
                eventHubClient.close();
            }
        };
    };

    private printMessage(outputChannel: vscode.OutputChannel, label: string) {
        return (message) => {
            Utility.output(this._outputChannel, label, 'Message received: ');
            Utility.output(this._outputChannel, label, JSON.stringify(message.body));
        };
    };
}