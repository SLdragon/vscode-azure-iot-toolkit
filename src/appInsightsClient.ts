'use strict';
import * as vscode from 'vscode';
import { Utility } from './utility';

const appInsights = require("applicationinsights");

export class AppInsightsClient {
    private _client;
    private _enableAppInsights;

    constructor() {
        console.log(`AI: constructor`)
        this._client = appInsights.getClient('6ada6440-d926-4331-b914-d8f1ea3b012f');
        let config = Utility.getConfiguration();
        this._enableAppInsights = config.get<boolean>('enableAppInsights');
    }

    public sendEvent(eventName: string, properties?: { [key: string]: string; }): void {
        if (this._enableAppInsights) {
            console.log(`sent AI: ${eventName}`)
            this._client.trackEvent(eventName, properties);
        }
    }
}