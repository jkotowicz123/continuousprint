/*
 * Calendar View for LAN Queue
 * Displays print jobs as calendar events with printer lanes
 *
 * Contributors: Continuous Print Team
 * License: AGPLv3
 */

if (typeof ko === "undefined" || ko === null) {
  ko = require('knockout');
}

function CPCalendarEvent(job, set, printer, startTime, endTime, isActive) {
  var self = this;
  self.job = job;
  self.set = set;
  self.printer = printer;
  self.startTime = startTime;
  self.endTime = endTime;
  self.isActive = ko.observable(isActive);
  self.duration = endTime - startTime;
  
  self.title = ko.computed(function() {
    return job._name ? job._name() : job.name;
  });
  
  self.setName = ko.computed(function() {
    if (!set) return '';
    return set.shortName ? set.shortName() : set.path.split(/[\\/]/).pop();
  });
  
  self.progress = ko.computed(function() {
    if (!set) return 0;
    let completed = set.completed ? set.completed() : 0;
    let remaining = set.remaining ? set.remaining() : 0;
    let total = completed + remaining;
    return total > 0 ? (completed / total) * 100 : 0;
  });
}

function CPCalendarLane(printer, address, profile, status) {
  var self = this;
  self.printer = printer;
  self.address = address;
  self.profile = profile;
  self.status = ko.observable(status);
  self.events = ko.observableArray([]);
  
  self.displayName = ko.computed(function() {
    return self.printer + (self.profile ? ` (${self.profile})` : '');
  });
  
  self.statusClass = ko.computed(function() {
    let s = self.status();
    if (s === 'printing') return 'printing';
    if (s === 'idle') return 'idle';
    if (s === 'error') return 'error';
    return 'offline';
  });
}

function CPCalendar(queue, humanize) {
  var self = this;
  self.queue = queue;
  self.humanize = humanize || function(n) { return n; };
  self.lanes = ko.observableArray([]);
  self.visible = ko.observable(false);
  self.timelineStart = ko.observable(new Date());
  self.timelineHours = ko.observable(24);
  self.currentTime = ko.observable(new Date());
  self.pixelsPerHour = ko.observable(60);
  
  self._updateInterval = null;
  
  self.timelineWidth = ko.computed(function() {
    return self.timelineHours() * self.pixelsPerHour();
  });
  
  self.timeMarkers = ko.computed(function() {
    let markers = [];
    let start = new Date(self.timelineStart());
    start.setMinutes(0, 0, 0);
    
    for (let i = 0; i <= self.timelineHours(); i++) {
      let time = new Date(start.getTime() + i * 3600000);
      markers.push({
        position: i * self.pixelsPerHour(),
        label: time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        isHour: true
      });
    }
    return markers;
  });
  
  self.currentTimePosition = ko.computed(function() {
    let now = self.currentTime();
    let start = self.timelineStart();
    let diffMs = now - start;
    let diffHours = diffMs / 3600000;
    return Math.max(0, diffHours * self.pixelsPerHour());
  });
  
  self.toggle = function() {
    self.visible(!self.visible());
    if (self.visible()) {
      self.refresh();
      self._startTimeUpdate();
    } else {
      self._stopTimeUpdate();
    }
  };
  
  self._startTimeUpdate = function() {
    if (self._updateInterval) return;
    self._updateInterval = setInterval(function() {
      self.currentTime(new Date());
    }, 60000);
  };
  
  self._stopTimeUpdate = function() {
    if (self._updateInterval) {
      clearInterval(self._updateInterval);
      self._updateInterval = null;
    }
  };
  
  self._getEstimatedPrintTime = function(set) {
    if (!set) return 3600000;
    let metadata = null;
    if (set.metadata) {
      metadata = typeof set.metadata === 'string' ? JSON.parse(set.metadata) : set.metadata;
    }
    if (metadata && metadata.estimatedPrintTime) {
      return metadata.estimatedPrintTime * 1000;
    }
    return 3600000;
  };
  
  self._getPrinterProfile = function(peer) {
    if (peer && peer.profile) {
      return peer.profile.name || '';
    }
    return '';
  };
  
  self.refresh = function() {
    if (!self.queue) return;
    
    let queueData = self.queue;
    let peers = queueData.peers || {};
    let jobs = queueData.jobs ? queueData.jobs() : [];
    let activeSets = queueData.active_sets ? queueData.active_sets() : [];
    
    let lanesMap = {};
    let now = new Date();
    self.timelineStart(now);
    self.currentTime(now);
    
    for (let addr in peers) {
      let peer = peers[addr];
      let lane = new CPCalendarLane(
        peer.name || addr,
        addr,
        self._getPrinterProfile(peer),
        peer.status || 'idle'
      );
      lanesMap[addr] = lane;
    }
    
    let printerTimes = {};
    for (let addr in lanesMap) {
      printerTimes[addr] = now.getTime();
    }
    
    for (let job of jobs) {
      let jobName = job._name ? job._name() : job.name;
      let jobSets = job.sets ? job.sets() : [];
      let acquiredBy = job.acquiredBy ? job.acquiredBy() : null;
      
      for (let set of jobSets) {
        let profiles = set.profiles ? set.profiles() : [];
        let setRemaining = set.remaining ? set.remaining() : 1;
        let setCompleted = set.completed ? set.completed() : 0;
        
        if (setRemaining <= 0) continue;
        
        let estimatedTime = self._getEstimatedPrintTime(set);
        
        for (let addr in lanesMap) {
          let lane = lanesMap[addr];
          let peer = peers[addr];
          let peerProfile = self._getPrinterProfile(peer);
          
          if (profiles.length > 0 && profiles.indexOf(peerProfile) === -1) {
            continue;
          }
          
          let isActive = activeSets.indexOf(set.id) !== -1;
          let startTime = new Date(printerTimes[addr]);
          let endTime = new Date(startTime.getTime() + estimatedTime);
          
          let event = new CPCalendarEvent(job, set, lane.printer, startTime, endTime, isActive);
          lane.events.push(event);
          
          printerTimes[addr] = endTime.getTime();
          break;
        }
      }
    }
    
    self.lanes(Object.values(lanesMap));
  };
  
  self.getEventStyle = function(event) {
    let start = self.timelineStart();
    let startOffset = (event.startTime - start) / 3600000 * self.pixelsPerHour();
    let width = (event.endTime - event.startTime) / 3600000 * self.pixelsPerHour();
    
    return {
      left: Math.max(0, startOffset) + 'px',
      width: Math.max(20, width) + 'px'
    };
  };
  
  self.formatDuration = function(ms) {
    let hours = Math.floor(ms / 3600000);
    let minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) {
      return hours + 'h ' + minutes + 'm';
    }
    return minutes + 'm';
  };
  
  self.zoomIn = function() {
    let current = self.pixelsPerHour();
    self.pixelsPerHour(Math.min(200, current + 20));
  };
  
  self.zoomOut = function() {
    let current = self.pixelsPerHour();
    self.pixelsPerHour(Math.max(20, current - 20));
  };
  
  self.scrollToNow = function() {
    self.timelineStart(new Date());
  };
}

try {
  module.exports = {CPCalendar, CPCalendarLane, CPCalendarEvent};
} catch {}
