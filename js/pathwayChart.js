// Clinical Trial Pathway chart: one patient's or kit's events in date order along a
// serpentine (snake) path, with a marker that travels the path as it draws.
// Ported from ChronlogicalLifeCycle/timeline-app.js, keeping its layout and curves.
// Changes from the original: one playback clock (play / pause / replay), each event appears
// exactly when the marker reaches it, the chart fills the page width, simple SVG icons,
// a details card for touch screens. Self-contained: it can be used on any page (see README).

var pathwayChart = {
  ROW_SPACING: 120,
  CURVE_STRENGTH: 80,
  MAX_EVENT_SPACING: 220,
  MS_PER_EVENT: 1000,       // playback time per event at 1x speed

  // Clean-up of long visit names (from the original backend)
  DISPLAY_NAMES: {
    "Randomization (Day 1 / Week 0)": "Randomization (Day 1)",
    "Day 7 / Week 1": "Week 1",
    "Day 14 / Week 2": "Week 2",
  },

  // Outline glyphs drawn inside the event badge (centred on 0,0, about 12px across)
  GLYPHS: {
    person: "M0,-5.5a2.6,2.6 0 1,0 0.01,0 M-5,5.5c0,-4 10,-4 10,0",
    clipboard: "M-4,-4.5h8v10h-8z M-2,-6h4v2.5h-4z M-2,-0.5h4 M-2,2.5h4",
    visit: "M-1.6,-5.5h3.2v3.9h3.9v3.2h-3.9v3.9h-3.2v-3.9h-3.9v-3.2h3.9z",
    status: "M-3.5,6v-12 M-3.5,-6h7l-2,3l2,3h-7",
    pill: "M-4,-3h8a3,3 0 0,1 0,6h-8a3,3 0 0,1 0,-6z M0,-3v6",
    box: "M-5,-2.5l5,-2.5l5,2.5v5.5l-5,2.5l-5,-2.5z M-5,-2.5l5,2.5l5,-2.5 M0,0v5.5",
    truck: "M-6,-3.5h7v6h-7z M1,-1h3l2,2v1.5h-5 M-3.5,4.2a1.2,1.2 0 1,0 0.01,0 M3.5,4.2a1.2,1.2 0 1,0 0.01,0",
  },

  // Playback state: progress 0..1 along the whole path. Kept across redraws of the same pathway.
  progress: 0,
  playing: false,
  speed: 1,
  duration: 0,
  timer: null,
  draw: null,
  currentId: null,
  onProgress: null,
  lastProgressKey: null,
  closeOnOutsideTap: false,

  play: function () {
    if (!this.draw) return;
    if (this.progress >= 1) this.progress = 0; // finished: play again from the start
    this.playing = true;
    this.startTimer();
    this.notify();
  },

  pause: function () {
    this.playing = false;
    this.stopTimer();
    this.notify();
  },

  startTimer: function () {
    var self = this;
    self.stopTimer();
    var last = 0;
    self.timer = d3.timer(function (elapsed) {
      // Advance by elapsed time x speed, so a speed change applies straight away
      self.progress = Math.min(1, self.progress + (elapsed - last) * self.speed / self.duration);
      last = elapsed;
      self.draw(self.progress);
      if (self.progress >= 1) {
        self.playing = false;
        self.stopTimer();
      }
      self.notify();
    });
  },

  stopTimer: function () {
    if (this.timer) {
      this.timer.stop();
      this.timer = null;
    }
  },

  notify: function () {
    var state = { playing: this.playing, finished: this.progress >= 1 };
    var key = state.playing + "|" + state.finished;
    if (this.onProgress && key !== this.lastProgressKey) {
      this.lastProgressKey = key;
      this.onProgress(state);
    }
  },

  displayName: function (event) {
    return this.DISPLAY_NAMES[event.EventName] || event.EventName;
  },

  // Which glyph an event gets (rules from the original backend)
  glyphFor: function (event) {
    var name = event.EventName.toLowerCase();
    if (event.ModuleType === "Patient") {
      if (name.includes("screening")) return "person";
      if (name.includes("randomization")) return "clipboard";
      if (name.includes("status")) return "status";
      return "visit";
    }
    if (name.includes("allocated to patient")) return "pill";
    if (name.includes("in transit")) return "truck";
    return "box";
  },

  // options: { id, eventsPerRow, onEventClick(event), onProgress(state) }
  render: function (container, events, options) {
    var self = this;
    self.stopTimer();
    self.onProgress = options.onProgress;
    self.lastProgressKey = null;

    // A new pathway starts playing from the beginning; a redraw of the same one carries on
    if (options.id !== self.currentId) {
      self.currentId = options.id;
      self.progress = 0;
      self.playing = true;
    }

    var root = d3.select(container);
    root.selectAll("*").remove();
    var eventsPerRow = options.eventsPerRow || 7;

    // The chart creates its own tooltip and details card, so it can be used on any page
    var tooltip = getOrCreate("pathway-tooltip", "tooltip");
    var detailsPanel = getOrCreate("pathway-details", "details-panel").property("hidden", true);
    if (!self.closeOnOutsideTap) {
      self.closeOnOutsideTap = true;
      document.addEventListener("click", function (e) {
        var panel = document.getElementById("pathway-details");
        if (panel && !panel.contains(e.target)) panel.hidden = true;
      });
    }

    // 1. Layout: rows of eventsPerRow, alternating left-to-right and right-to-left

    var width = Math.max(container.clientWidth, 600);
    var side = self.CURVE_STRENGTH / 2 + 50; // room for the curves and labels at the row ends
    var innerWidth = width - 2 * side;
    var eventSpacing = eventsPerRow > 1 ? Math.min(self.MAX_EVENT_SPACING, innerWidth / (eventsPerRow - 1)) : 0;
    var margin = { top: 50, bottom: 40, left: side + (innerWidth - eventSpacing * (eventsPerRow - 1)) / 2 };

    var layout = calculateCurvedLayout(events, eventsPerRow, eventSpacing);

    // 2. Draw canvas

    var svg = root.append("svg")
      .attr("class", "timeline-svg")
      .attr("width", width)
      .attr("height", layout.totalHeight + margin.top + margin.bottom);

    // Gradient across the chart width. (Sized to the path's own box, as in the original,
    // it disappears on a single-row pathway because a flat line's box has no height.)
    var gradient = svg.append("defs").append("linearGradient")
      .attr("id", "pathGradient")
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", 0).attr("y1", 0)
      .attr("x2", width - 2 * side).attr("y2", 0);
    gradient.append("stop").attr("class", "gradient-start").attr("offset", "0%");
    gradient.append("stop").attr("class", "gradient-end").attr("offset", "100%");

    var g = svg.append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // 3. Paths: faint guide, and the active path that draws itself during playback

    var pathData = createCurvedPath(layout.positions);

    g.append("path")
      .attr("class", "guide-path")
      .attr("d", pathData);

    var activePath = g.append("path")
      .attr("class", "active-path")
      .attr("d", pathData);

    var totalLength = activePath.node().getTotalLength();
    activePath.attr("stroke-dasharray", `${totalLength} ${totalLength}`);

    // Distance along the path at which each event sits, so it appears exactly as the marker arrives
    var measure = g.append("path").style("display", "none");
    var eventLengths = layout.positions.map(function (p, i) {
      measure.attr("d", createCurvedPath(layout.positions.slice(0, i + 1)));
      return i === 0 ? 0 : measure.node().getTotalLength();
    });
    measure.remove();

    // 4. Events

    var eventGroups = g.selectAll(".event-group")
      .data(events)
      .join("g")
      .attr("class", d => "event-group" + (d.RelatedKey ? " has-link" : ""))
      .attr("transform", (d, i) => `translate(${layout.positions[i].x}, ${layout.positions[i].y})`)
      .style("opacity", 0)
      .style("pointer-events", "none");

    // Inner group carries the "pop" scale, so it never mixes with the position transform
    var inner = eventGroups.append("g").attr("class", "event-inner");

    inner.append("circle")
      .attr("class", "event-badge")
      .attr("r", 14);

    inner.append("path")
      .attr("class", "event-glyph")
      .attr("d", d => self.GLYPHS[self.glyphFor(d)]);

    // Patient visits where a kit was dispensed get a small pill badge, as in the original
    var dispensed = inner.filter(d => d.ModuleType === "Patient" && d.RelatedType === "Kit")
      .append("g")
      .attr("transform", "translate(12, -11) scale(0.7)");
    dispensed.append("circle").attr("class", "event-badge").attr("r", 10);
    dispensed.append("path").attr("class", "event-glyph").attr("d", self.GLYPHS.pill);

    var maxLabelChars = Math.max(8, Math.floor((eventSpacing || 160) / 6));
    inner.append("text")
      .attr("class", "event-label")
      .attr("y", -26)
      .text(function (d) {
        var name = self.displayName(d);
        return name.length > maxLabelChars ? name.slice(0, maxLabelChars - 1) + "…" : name;
      });

    inner.append("text")
      .attr("class", "event-date")
      .attr("y", 30)
      .text(d => d3.timeFormat("%m/%d")(d.date));

    // Mouse: hover shows the tooltip, clicking an event with a related item opens that pathway.
    // Touch (no hover): tapping an event opens a details card with an "Open ..." button.
    var formatDate = d3.timeFormat("%B %d, %Y at %I:%M %p");
    var lastPointerType = "mouse";

    function eventDetailsHtml(d) {
      return `<h4>${escapeHtml(self.displayName(d))}</h4>` +
        detail("Date", formatDate(d.date)) +
        detail("Type", d.EventType) +
        (d.EventDetails ? detail("Details", d.EventDetails) : "") +
        (d.RelatedKey ? detail("Related", `${d.RelatedType} ${d.RelatedKey}`) : "");
    }

    inner.append("rect")
      .attr("x", -18).attr("y", -18)
      .attr("width", 36).attr("height", 36)
      .style("fill", "transparent")
      .on("pointerdown", event => { lastPointerType = event.pointerType; })
      .on("pointermove", function (event, d) {
        if (event.pointerType !== "mouse") return;
        lastPointerType = "mouse";
        tooltip.html(eventDetailsHtml(d) + (d.RelatedKey
            ? `<div class="hint">Click to open the ${d.RelatedType.toLowerCase()} pathway</div>` : ""))
          .style("opacity", 1)
          .style("left", (event.pageX + 12) + "px")
          .style("top", (event.pageY - 10) + "px");
      })
      .on("pointerleave", () => tooltip.style("opacity", 0))
      .on("click", function (event, d) {
        event.stopPropagation();
        tooltip.style("opacity", 0);
        if (lastPointerType === "mouse") {
          if (d.RelatedKey && options.onEventClick) options.onEventClick(d);
        } else {
          showDetailsPanel(event, d);
        }
      });

    function showDetailsPanel(event, d) {
      detailsPanel.html(`<button type="button" class="details-close" aria-label="Close">&times;</button>` +
          eventDetailsHtml(d) +
          (d.RelatedKey && options.onEventClick
            ? `<button type="button" class="details-open">Open ${d.RelatedType.toLowerCase()} ${escapeHtml(d.RelatedKey)} &rarr;</button>` : ""))
        .property("hidden", false);

      // Keep the card on screen
      var panelWidth = detailsPanel.node().offsetWidth;
      var left = Math.max(8, Math.min(event.pageX - panelWidth / 2, window.scrollX + window.innerWidth - panelWidth - 8));
      detailsPanel.style("left", left + "px").style("top", (event.pageY + 20) + "px");

      detailsPanel.select(".details-close").on("click", () => detailsPanel.property("hidden", true));
      detailsPanel.select(".details-open").on("click", function () {
        detailsPanel.property("hidden", true);
        options.onEventClick(d);
      });
    }

    // 5. Progress marker

    var marker = g.append("circle")
      .attr("class", "progress-marker")
      .attr("r", 7)
      .style("opacity", 0);

    // 6. Draw one frame at progress p (0..1)

    var shown = events.map(() => false);

    function draw(p) {
      var length = p * totalLength;

      activePath
        .style("opacity", p > 0 ? 1 : 0)
        .attr("stroke-dashoffset", totalLength - length);

      var point = activePath.node().getPointAtLength(length);
      marker
        .attr("cx", point.x)
        .attr("cy", point.y)
        .style("opacity", p > 0 && p < 1 ? 1 : 0);

      eventGroups.each(function (d, i) {
        var visible = p >= 1 || eventLengths[i] <= length + 0.5;
        if (visible === shown[i]) return;
        shown[i] = visible;
        var group = d3.select(this).style("pointer-events", visible ? null : "none");
        if (visible) {
          // Appear, then a small "bounce" (as in the original)
          group.transition().duration(300).style("opacity", 1);
          group.select(".event-inner")
            .transition().delay(300).duration(200).attr("transform", "scale(1.2)")
            .transition().duration(200).attr("transform", "scale(1)");
        } else {
          group.interrupt().style("opacity", 0);
          group.select(".event-inner").interrupt().attr("transform", null);
        }
      });
    }

    self.draw = draw;
    self.duration = Math.max(1, events.length * self.MS_PER_EVENT);
    draw(self.progress);
    if (self.playing) self.startTimer();
    self.notify();

    // Helpers

    function detail(label, value) {
      return `<div class="detail"><span class="label">${label}:</span><span>${escapeHtml(value)}</span></div>`;
    }

    function getOrCreate(id, className) {
      var element = d3.select("#" + id);
      return element.empty() ? d3.select("body").append("div").attr("id", id).attr("class", className) : element;
    }

    function escapeHtml(text) {
      return String(text).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    }

    function calculateCurvedLayout(events, eventsPerRow, eventSpacing) {
      var positions = events.map(function (event, index) {
        var row = Math.floor(index / eventsPerRow);
        var eventInRow = index % eventsPerRow;
        var leftToRight = row % 2 === 0; // even rows L->R, odd rows R->L
        return {
          x: (leftToRight ? eventInRow : eventsPerRow - 1 - eventInRow) * eventSpacing,
          y: row * self.ROW_SPACING,
          row: row,
          direction: leftToRight ? "left-to-right" : "right-to-left",
        };
      });
      var rowCount = Math.ceil(events.length / eventsPerRow);
      return { positions: positions, totalHeight: rowCount * self.ROW_SPACING };
    }

    // Straight lines along a row, a rounded turn at the end of each row (original logic)
    function createCurvedPath(positions) {
      var path = d3.path();
      if (!positions.length) return "";
      path.moveTo(positions[0].x, positions[0].y);

      for (var i = 1; i < positions.length; i++) {
        var prev = positions[i - 1];
        var curr = positions[i];

        if (curr.row > prev.row) {
          var midY = prev.y + self.ROW_SPACING / 2;
          var curveX = prev.direction === "left-to-right"
            ? Math.max(prev.x, curr.x) + self.CURVE_STRENGTH / 2
            : Math.min(prev.x, curr.x) - self.CURVE_STRENGTH / 2;
          path.quadraticCurveTo(curveX, prev.y + self.CURVE_STRENGTH / 3, curveX, midY);
          path.quadraticCurveTo(curveX, curr.y - self.CURVE_STRENGTH / 3, curr.x, curr.y);
        } else {
          path.lineTo(curr.x, curr.y);
        }
      }
      return path.toString();
    }
  },
};
