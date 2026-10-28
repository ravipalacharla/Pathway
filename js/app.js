// Clinical Trial Pathway: loads the events, handles module/key selection and search,
// related-item navigation with Back, export, settings, and asks pathwayChart to draw.

document.addEventListener("DOMContentLoaded", function () {
  app.onLoad();
});

var app = {
  eventsByModule: {},   // { Patient: Map(key -> events), Kit: Map(key -> events) }
  current: null,        // { type, key, events }
  history: [],          // pathways visited through related links, for Back
  eventsPerRow: 7,

  THEMES: {
    primary: { primary: "#00A3E0", secondary: "#005587" },
    accent: { primary: "#00CCFF", secondary: "#005587" },
    green: { primary: "#43B02A", secondary: "#027223" },
    teal: { primary: "#00BFB3", secondary: "#008F86" },
  },

  onLoad: function () {
    var self = this;
    var parseDate = d3.timeParse("%Y-%m-%d %H:%M");

    d3.csv("data/events.csv", function (d) {
      d.date = parseDate(d.EventDate);
      return d;
    }).then(function (rows) {
      ["Patient", "Kit"].forEach(function (type) {
        var byKey = d3.group(rows.filter(d => d.ModuleType === type), d => d.ModuleKey);
        byKey.forEach(events => events.sort((a, b) => a.date - b.date));
        self.eventsByModule[type] = new Map(Array.from(byKey).sort((a, b) => d3.ascending(a[0], b[0])));
      });
      self.addListeners();

      // Open with the first patient in the list, so the page never starts empty
      var firstPatient = self.eventsByModule.Patient.keys().next().value;
      if (firstPatient) self.select("Patient", firstPatient);
    }).catch(function (error) {
      console.error("Error loading data:", error);
      self.showMessage("Could not load data/events.csv. Run the page from a local web server (see README.md).", true);
    });
  },

  addListeners: function () {
    var self = this;
    var keyInput = document.getElementById("moduleKey");

    document.getElementById("moduleType").addEventListener("change", function () {
      self.history = [];
      self.setModuleType(this.value);
      if (this.value) keyInput.focus();
    });

    // Load as soon as the typed or picked value is an exact key
    keyInput.addEventListener("input", function () {
      var type = document.getElementById("moduleType").value;
      if (self.eventsByModule[type] && self.eventsByModule[type].has(this.value.trim())) {
        self.history = [];
        self.select(type, this.value.trim());
      }
    });

    keyInput.addEventListener("change", function () {
      var type = document.getElementById("moduleType").value;
      var key = this.value.trim();
      if (key && !(self.eventsByModule[type] && self.eventsByModule[type].has(key))) {
        self.showMessage(`No ${type.toLowerCase()} "${key}" found. Type part of the number and pick it from the list.`);
      }
    });

    document.getElementById("backLink").addEventListener("click", function (e) {
      e.preventDefault();
      var previous = self.history.pop();
      if (previous) self.select(previous.type, previous.key);
    });

    document.getElementById("playBtn").addEventListener("click", function () {
      if (pathwayChart.playing) pathwayChart.pause();
      else pathwayChart.play();
    });

    document.getElementById("exportBtn").addEventListener("click", function () {
      self.exportCSV();
    });

    // Settings panel
    var panel = document.getElementById("settingsPanel");
    document.getElementById("settingsBtn").addEventListener("click", function (e) {
      e.stopPropagation();
      panel.hidden = !panel.hidden;
    });
    document.addEventListener("click", function (e) {
      if (!panel.contains(e.target)) panel.hidden = true;
    });

    document.getElementById("eventsPerRow").addEventListener("change", function () {
      self.eventsPerRow = +this.value;
      self.render();
    });

    document.getElementById("speedControl").addEventListener("input", function () {
      pathwayChart.speed = +this.value;
      document.getElementById("speedValue").textContent = this.value + "x";
    });

    document.getElementById("themeSelector").addEventListener("change", function () {
      var theme = self.THEMES[this.value];
      document.documentElement.style.setProperty("--primary-color", theme.primary);
      document.documentElement.style.setProperty("--secondary-color", theme.secondary);
    });

    var resizeTimeout;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(function () { self.render(); }, 200);
    });
  },

  // Fill the search list with the numbers of the chosen type (Patient or Kit)
  setModuleType: function (type) {
    var keyInput = document.getElementById("moduleKey");
    var keys = type ? Array.from(this.eventsByModule[type].keys()) : [];

    d3.select("#moduleKeyList").selectAll("option")
      .data(keys)
      .join("option")
      .attr("value", d => d);

    keyInput.value = "";
    keyInput.disabled = !type;
    keyInput.placeholder = type ? `Type or pick (${keys.length} ${type.toLowerCase()}s)` : "Choose patient or kit first";
    document.getElementById("moduleKeyLabel").textContent = type ? `${type} Number` : "Number";

    this.current = null;
    pathwayChart.stopTimer();
    pathwayChart.currentId = null;
    document.getElementById("timelineSummary").hidden = true;
    document.getElementById("playBtn").disabled = true;
    document.getElementById("exportBtn").disabled = true;
    this.showMessage(type ? `Select a ${type.toLowerCase()} to view its pathway` : "Select a patient or kit to view its pathway");
  },

  select: function (type, key) {
    if (document.getElementById("moduleType").value !== type) {
      document.getElementById("moduleType").value = type;
      this.setModuleType(type);
    }
    document.getElementById("moduleKey").value = key;

    this.current = { type: type, key: key, events: this.eventsByModule[type].get(key) };
    this.render();
    this.updateSummary();
    document.getElementById("playBtn").disabled = false;
    document.getElementById("exportBtn").disabled = false;
  },

  // Following a related link remembers where we came from
  openRelated: function (event) {
    if (!this.eventsByModule[event.RelatedType] || !this.eventsByModule[event.RelatedType].has(event.RelatedKey)) {
      this.showMessage(`No events found for ${event.RelatedType} ${event.RelatedKey}`, true);
      return;
    }
    this.history.push({ type: this.current.type, key: this.current.key });
    this.select(event.RelatedType, event.RelatedKey);
  },

  render: function () {
    var self = this;
    if (!self.current) return;

    pathwayChart.render(document.getElementById("timelineContent"), self.current.events, {
      id: self.current.type + "|" + self.current.key,
      eventsPerRow: self.eventsPerRow,
      onEventClick: event => self.openRelated(event),
      onProgress: state => self.updatePlayButton(state),
    });
    self.updateSummary();
  },

  updateSummary: function () {
    var events = this.current.events;
    var format = d3.timeFormat("%m/%d/%y");
    var range = events.length > 1
      ? `${format(events[0].date)} - ${format(events[events.length - 1].date)}`
      : format(events[0].date);

    var days = d3.timeDay.count(events[0].date, events[events.length - 1].date);

    document.getElementById("summaryText").textContent =
      `${this.current.type} ${this.current.key} • ${events.length} events • ${range} (${days} days)`;
    document.getElementById("statusChip").textContent = this.describeStatus(this.current.type, events);
    document.getElementById("backLink").hidden = this.history.length === 0;
    document.getElementById("timelineSummary").hidden = false;
  },

  // One-line status: a patient's outcome, or where a kit is now
  describeStatus: function (type, events) {
    var last = events[events.length - 1];
    if (type === "Kit") {
      return last.RelatedType === "Patient" ? `${last.EventName} ${last.RelatedKey}` : last.EventName;
    }
    var statusChange = events.filter(e => e.EventName === "Patient Status Change").pop();
    if (statusChange) return statusChange.EventDetails.replace(/^Status:\s*/, "");
    return `Ongoing, last visit ${pathwayChart.displayName(last)}`;
  },

  updatePlayButton: function (state) {
    var button = document.getElementById("playBtn");
    var mode = state.playing ? "Pause" : state.finished ? "Replay" : "Play";
    button.innerHTML = { Pause: "&#10074;&#10074;", Play: "&#9654;&#xFE0E;", Replay: "&#8635;" }[mode];
    button.title = mode;
    button.setAttribute("aria-label", mode);
  },

  // Download the current pathway as CSV (built in the browser)
  exportCSV: function () {
    if (!this.current) return;
    var columns = ["ModuleType", "ModuleKey", "EventDate", "EventType", "EventName",
      "EventDetails", "RelatedType", "RelatedKey"];
    var csv = d3.csvFormat(this.current.events, columns);
    var blob = new Blob([csv], { type: "text/csv" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${this.current.type}_${this.current.key}_pathway.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  },

  showMessage: function (text, isError) {
    pathwayChart.stopTimer();
    pathwayChart.currentId = null;
    document.getElementById("playBtn").disabled = true;
    document.getElementById("exportBtn").disabled = true;

    var content = document.getElementById("timelineContent");
    content.innerHTML = "";
    var div = document.createElement("div");
    div.className = isError ? "error" : "message";
    div.textContent = text;
    content.appendChild(div);
  },
};
