import { App } from 'aws-cdk-lib';
import { DropStack } from './stack.js';

new DropStack(new App(), 'Drop');
