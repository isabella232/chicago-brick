/* Copyright 2019 Google Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

import * as monitor from '../monitoring/monitor.js';
import * as time from '../util/time.js';
import {configure} from '../../lib/module_player.js';
import {RunningModule} from './module.js';
import {easyLog} from '../../lib/log.js';

const log = easyLog('wall:module_state_machine');

export const ServerModulePlayer = configure({
  makeEmptyModule: () => {
    return RunningModule.empty();
  },
  monitor: {
    isEnabled() {
      return monitor.isEnabled();
    },
    update(obj) {
      monitor.update({server: obj});
    }
  },
  log,
  time,
});
