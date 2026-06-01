(function () {
  const DATA_URL = "data/journey.json";
  const state = {
    data: null,
    activeIndex: 0,
    map: null,
    routeLayer: null,
    routeLine: null,
    routeProgressLine: null,
    routeMetrics: null,
    pointMarkers: [],
    vehicleMarker: null,
    activeBackgroundLayer: 0,
    visibleStageType: null,
    mediaGroup: null,
    mediaGroupKey: null,
    ticking: false
  };

  const elements = {};

  document.addEventListener("DOMContentLoaded", boot);

  async function boot() {
    cacheElements();
    setupScrollProgress();

    try {
      state.data = await fetchJson(DATA_URL);
      renderDateRail(state.data.meta, state.data.scenes);
      renderStory(state.data.scenes);
      renderSources(state.data.sources);
      setupMap();
      setupSceneObserver();
      setActiveScene(0, { immediate: true });
    } catch (error) {
      console.error(error);
      elements.storyColumn.innerHTML = '<section class="story-scene is-active"><p class="eyebrow">Journey</p><h2>旅程暂时没有载入</h2><p>请稍后刷新页面。</p></section>';
    }
  }

  function cacheElements() {
    [
      "ambient-a",
      "ambient-b",
      "scroll-progress-bar",
      "rail-range",
      "date-list",
      "story-column",
      "stage-panel",
      "stage-content",
      "stage-kicker",
      "stage-title",
      "stage-map",
      "stage-media",
      "sources-list"
    ].forEach((id) => {
      elements[toCamel(id)] = document.getElementById(id);
    });
  }

  async function fetchJson(url) {
    const response = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Cannot load ${url}`);
    return response.json();
  }

  function renderDateRail(meta, scenes) {
    const dates = dateRange(meta.startDate, meta.endDate);
    const first = formatMonthDay(meta.startDate);
    const last = formatMonthDay(meta.endDate);
    elements.railRange.textContent = `${first} - ${last}`;
    elements.dateList.innerHTML = dates.map((date) => {
      const scene = primarySceneForDate(date, scenes);
      return `<button type="button" class="date-node" data-date="${date}">
        <span class="date-marker" aria-hidden="true"></span>
        <span class="date-copy">
          <span class="date-value">${formatMonthDay(date)}</span>
          <strong>${weekdayLabel(date)}</strong>
          <em>${escapeHtml(scene ? railLabel(scene) : "行程")}</em>
        </span>
      </button>`;
    }).join("");

    elements.dateList.addEventListener("click", (event) => {
      const node = event.target.closest("[data-date]");
      if (!node) return;
      const sceneIndex = state.data.scenes.findIndex((scene) => dateInside(dateValue(node.dataset.date), scene.startDate, scene.endDate));
      if (sceneIndex >= 0) {
        document.querySelector(`[data-scene-index="${sceneIndex}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  function renderStory(scenes) {
    elements.storyColumn.innerHTML = scenes.map((scene, index) => {
      const hasSpotlight = Array.isArray(scene.spotlight) && scene.spotlight.length > 0;
      const spotlight = hasSpotlight ? `
        <div class="scene-highlights">
          ${scene.spotlight.map((item) => highlightMarkup(item)).join("")}
        </div>
      ` : "";

      const sections = scene.sections ? `
        <div class="scene-sections">
          ${scene.sections.map((section) => `
            <section>
              <h3>${escapeHtml(section.title)}</h3>
              ${listMarkup(section.items)}
            </section>
          `).join("")}
        </div>
      ` : "";

      const tips = scene.tips ? `
        <div class="tips">
          <h3>Tips</h3>
          ${listMarkup(scene.tips)}
        </div>
      ` : "";

      const mode = scene.mode || scene.type;
      return `<article class="story-scene" data-scene-index="${index}" data-mode="${escapeAttribute(mode)}">
        <p class="eyebrow">${escapeHtml(scene.eyebrow)}</p>
        <h2>${escapeHtml(scene.title)}</h2>
        <p class="scene-summary">${escapeHtml(scene.summary)}</p>
        ${spotlight}
        ${sections}
        ${tips}
      </article>`;
    }).join("");
  }

  function renderSources(sources) {
    elements.sourcesList.innerHTML = sources.map((source) => `
      <a class="source-link" href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">
        <strong>${escapeHtml(source.label)}</strong>
        <span>${escapeHtml(source.note)}</span>
      </a>
    `).join("");
  }

  function setupMap() {
    if (!window.L) {
      elements.stageMap.innerHTML = '<div class="map-fallback">地图暂时不可用</div>';
      return;
    }

    state.map = L.map(elements.stageMap, {
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      touchZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      tap: false,
      attributionControl: true
    }).setView([48.8, 18], 4);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(state.map);

    state.routeLayer = L.layerGroup().addTo(state.map);
  }

  function isCoarsePointer() {
    return window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth <= 900;
  }

  function setupSceneObserver() {
    updateScrollDrivenScene();
  }

  function updateScrollDrivenScene() {
    const sceneElements = document.querySelectorAll(".story-scene");
    if (!sceneElements.length) return;

    const triggerLine = scrollTriggerLine();
    let nextIndex = 0;
    sceneElements.forEach((scene, index) => {
      if (scene.getBoundingClientRect().top <= triggerLine) {
        nextIndex = index;
      }
    });

    if (nextIndex !== state.activeIndex) {
      setActiveScene(nextIndex);
      return;
    }

    updateActiveStageProgress();
  }

  function setupScrollProgress() {
    const update = () => {
      if (state.ticking) return;
      state.ticking = true;
      requestAnimationFrame(() => {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const progress = maxScroll > 0 ? window.scrollY / maxScroll : 0;
        elements.scrollProgressBar.style.transform = `scaleX(${progress})`;
        if (state.data) {
          updateScrollDrivenScene();
        } else {
          updateActiveStageProgress();
        }
        state.ticking = false;
      });
    };

    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  function setActiveScene(index, options = {}) {
    if (!state.data?.scenes[index]) return;
    if (!options.immediate && index === state.activeIndex) return;

    state.activeIndex = index;
    const scene = state.data.scenes[index];

    document.querySelectorAll(".story-scene").forEach((item, itemIndex) => {
      item.classList.toggle("is-active", itemIndex === index);
    });

    updateDateRail(scene);
    updateAmbient(scene);
    updateStage(scene);
  }

  function updateDateRail(scene) {
    const start = dateValue(scene.startDate);
    const end = dateValue(scene.endDate);
    document.querySelectorAll(".date-node").forEach((node) => {
      const current = dateValue(node.dataset.date);
      const active = current >= start && current <= end;
      node.classList.toggle("is-active", active);
    });
  }

  function updateAmbient(scene) {
    const nextLayer = state.activeBackgroundLayer === 0 ? elements.ambientB : elements.ambientA;
    const previousLayer = state.activeBackgroundLayer === 0 ? elements.ambientA : elements.ambientB;
    nextLayer.style.backgroundImage = `url("${scene.background.image}")`;
    nextLayer.classList.add("is-active");
    previousLayer.classList.remove("is-active");
    state.activeBackgroundLayer = state.activeBackgroundLayer === 0 ? 1 : 0;

    document.body.dataset.tone = scene.background.tone || "day";
  }

  function updateStage(scene) {
    const isTransport = scene.type === "transport";
    const nextType = isTransport ? "map" : "media";

    const applyStage = () => {
      if (state.data?.scenes[state.activeIndex] !== scene) {
        elements.stageContent.classList.remove("is-switching");
        elements.stagePanel.classList.remove("is-switching");
        return;
      }

      elements.stagePanel.dataset.stageMode = isTransport ? scene.mode : scene.type;
      elements.stageKicker.textContent = scene.eyebrow;
      elements.stageTitle.textContent = scene.title;
      elements.stageMap.classList.add("is-visible");
      elements.stageMedia.classList.add("is-visible");

      if (isTransport) {
        renderRoute(scene);
      } else {
        renderMedia(state.activeIndex);
      }

      state.visibleStageType = nextType;
      requestAnimationFrame(() => {
        elements.stageContent.classList.remove("is-switching");
        elements.stagePanel.classList.remove("is-switching");
        updateActiveStageProgress();
        updateStageLayerBlend();
      });
    };

    applyStage();
  }

  function renderRoute(scene) {
    if (!state.map || !scene.map) return;

    clearRouteLayers();

    const points = scene.map.points.map((point) => [point.lat, point.lng]);
    const color = routeColor(scene.mode);
    state.routeMetrics = buildRouteMetrics(points);

    state.routeLine = L.polyline(points, {
      color,
      weight: scene.mode === "flight" ? 3 : 4,
      opacity: 0.26,
      dashArray: scene.mode === "flight" ? "10 12" : scene.mode === "local" ? "6 8" : null,
      className: `route-line route-base route-${scene.mode}`
    }).addTo(state.routeLayer);

    state.routeProgressLine = L.polyline([points[0]], {
      color,
      weight: scene.mode === "flight" ? 4 : 5,
      opacity: 0.98,
      dashArray: scene.mode === "flight" ? "10 12" : scene.mode === "local" ? "6 8" : null,
      className: `route-line route-progress route-${scene.mode}`
    }).addTo(state.routeLayer);

    scene.map.points.forEach((point, index) => {
      const marker = L.circleMarker([point.lat, point.lng], {
        radius: index === scene.map.points.length - 1 ? 7 : 5,
        color: "#fff8ea",
        weight: 1.4,
        fillColor: index === 0 ? "#8bc9c3" : index === scene.map.points.length - 1 ? "#e9c98f" : "#d99ba5",
        fillOpacity: 0.96
      }).addTo(state.routeLayer);
      marker.bindTooltip(point.label, { permanent: true, direction: "top", className: "route-tooltip" });
      state.pointMarkers.push(marker);
    });

    const vehiclePoint = points[0];
    state.vehicleMarker = L.marker(vehiclePoint, {
      icon: L.divIcon({
        html: `<span class="vehicle-symbol">${escapeHtml(scene.map.vehicle)}</span>`,
        className: `vehicle-icon vehicle-${scene.mode}`,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      })
    }).addTo(state.routeLayer);

    const bounds = L.latLngBounds(points);
    const fitOptions = {
      padding: scene.mode === "flight" ? [42, 42] : [70, 70],
      maxZoom: scene.mode === "local" ? 13 : scene.mode === "train" ? 8 : 4,
      fixedZoom: fixedRouteZoom(scene.mode)
    };
    fitRouteBounds(bounds, fitOptions);

    updateRouteProgress(scene, routeSceneProgress(state.activeIndex));
    setTimeout(() => {
      if (state.data?.scenes[state.activeIndex] !== scene) return;
      fitRouteBounds(bounds, fitOptions);
      updateActiveStageProgress();
    }, 80);
  }

  function fitRouteBounds(bounds, options) {
    if (!state.map) return;
    state.map.invalidateSize();
    if (typeof options.fixedZoom === "number") {
      const center = bounds.getCenter();
      state.map.setView([center.lat, center.lng], options.fixedZoom, { animate: false, reset: true });
      return;
    }

    state.map.fitBounds(bounds, { ...options, animate: false, reset: true });
  }

  function fixedRouteZoom(mode) {
    if (mode === "local") return 13;
    if (mode === "train") return 7;
    return null;
  }

  function updateActiveStageProgress() {
    const scene = state.data?.scenes[state.activeIndex];
    if (!scene) return;

    const progress = routeSceneProgress(state.activeIndex);
    if (scene.type === "transport" && scene.map) {
      updateRouteProgress(scene, progress);
      updateStageLayerBlend();
      return;
    }

    updateMediaProgress();
    updateStageLayerBlend();
  }

  function updateMediaProgress() {
    if (!state.mediaGroup) return;
    const maxScroll = elements.stageMedia.scrollHeight - elements.stageMedia.clientHeight;
    if (maxScroll <= 0) return;
    elements.stageMedia.scrollTop = maxScroll * mediaGroupProgress(state.mediaGroup);
  }

  function updateStageLayerBlend() {
    const scene = state.data?.scenes[state.activeIndex];
    if (!scene) return;

    const currentType = stageType(scene);
    const previousScene = state.data.scenes[state.activeIndex - 1];
    const previousType = previousScene ? stageType(previousScene) : currentType;
    const entryProgress = previousType !== currentType ? sceneEntryBlendProgress(state.activeIndex) : 1;

    let mapOpacity = currentType === "map" ? 1 : 0;
    let mediaOpacity = currentType === "media" ? 1 : 0;

    if (previousType !== currentType) {
      mapOpacity = currentType === "map" ? entryProgress : 1 - entryProgress;
      mediaOpacity = currentType === "media" ? entryProgress : 1 - entryProgress;
    }

    applyStageLayerVisual(elements.stageMap, mapOpacity);
    applyStageLayerVisual(elements.stageMedia, mediaOpacity);
  }

  function applyStageLayerVisual(element, opacity) {
    const eased = clamp(opacity, 0, 1);
    element.style.opacity = eased.toFixed(3);
    element.style.transform = `translateY(${(1 - eased) * 10}px) scale(${0.992 + eased * 0.008})`;
    element.style.filter = eased < 0.995 ? `blur(${(1 - eased) * 2}px)` : "none";
  }

  function sceneEntryBlendProgress(index) {
    const sceneElement = document.querySelector(`[data-scene-index="${index}"]`);
    if (!sceneElement) return 1;

    const distance = window.innerHeight * (isCoarsePointer() ? 0.124 : 0.1);
    return clamp((scrollTriggerLine() - sceneElement.getBoundingClientRect().top) / distance, 0, 1);
  }

  function routeSceneProgress(index) {
    const sceneElement = document.querySelector(`[data-scene-index="${index}"]`);
    if (!sceneElement) return 0;

    const rect = sceneElement.getBoundingClientRect();
    const startLine = progressStartLine(index);
    const endLine = progressEndLine(index);
    const distance = Math.max(rect.height + startLine - endLine, 1);

    return clamp((startLine - rect.top) / distance, 0, 1);
  }

  function scrollTriggerLine() {
    return window.innerHeight * (isCoarsePointer() ? 0.64 : 0.72);
  }

  function progressStartLine(index) {
    if (isCoarsePointer() && index === 0) {
      return window.innerHeight * 1.64;
    }

    return scrollTriggerLine();
  }

  function progressEndLine(index) {
    if (isCoarsePointer() && index === 0) {
      return scrollTriggerLine();
    }

    return scrollTriggerLine();
  }

  function updateRouteProgress(scene, progress) {
    if (!state.routeMetrics || !state.routeProgressLine || !state.vehicleMarker) return;

    const travelProgress = transportTravelProgress(progress);
    const route = interpolateRoute(state.routeMetrics, travelProgress);
    state.routeProgressLine.setLatLngs(route.traveled);
    state.vehicleMarker.setLatLng(route.latLng);
    state.vehicleMarker.setZIndexOffset(1000);

    const markerElement = state.vehicleMarker.getElement();
    if (markerElement) {
      markerElement.style.setProperty("--vehicle-angle", `${route.bearing}deg`);
      markerElement.setAttribute("aria-label", `${scene.mode === "train" ? "火车" : scene.mode === "flight" ? "飞机" : "交通工具"}行进进度 ${Math.round(travelProgress * 100)}%`);
    }
  }

  function transportTravelProgress(progress) {
    return clamp((progress - 0.14) / 0.82, 0, 1);
  }

  function buildRouteMetrics(points) {
    const latLngs = points.map((point) => L.latLng(point[0], point[1]));
    const segments = [];
    let total = 0;

    for (let index = 0; index < latLngs.length - 1; index += 1) {
      const from = latLngs[index];
      const to = latLngs[index + 1];
      const length = Math.max(from.distanceTo(to), 1);
      const start = total;
      total += length;
      segments.push({ from, to, start, end: total, length });
    }

    return { latLngs, segments, total };
  }

  function interpolateRoute(metrics, progress) {
    if (!metrics.segments.length) {
      const [latLng] = metrics.latLngs;
      return { latLng, traveled: [latLng], bearing: 0 };
    }

    const target = metrics.total * clamp(progress, 0, 1);
    const traveled = [metrics.latLngs[0]];

    for (const segment of metrics.segments) {
      if (target >= segment.end) {
        traveled.push(segment.to);
        continue;
      }

      const segmentProgress = clamp((target - segment.start) / segment.length, 0, 1);
      const latLng = interpolateLatLng(segment.from, segment.to, segmentProgress);
      traveled.push(latLng);
      return {
        latLng,
        traveled,
        bearing: routeBearing(segment.from, segment.to)
      };
    }

    const lastSegment = metrics.segments[metrics.segments.length - 1];
    const lastLatLng = metrics.latLngs[metrics.latLngs.length - 1];
    return {
      latLng: lastLatLng,
      traveled,
      bearing: routeBearing(lastSegment.from, lastSegment.to)
    };
  }

  function interpolateLatLng(from, to, progress) {
    return L.latLng(
      from.lat + (to.lat - from.lat) * progress,
      from.lng + (to.lng - from.lng) * progress
    );
  }

  function routeBearing(from, to) {
    const startLat = degreesToRadians(from.lat);
    const endLat = degreesToRadians(to.lat);
    const deltaLng = degreesToRadians(to.lng - from.lng);
    const y = Math.sin(deltaLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLng);
    return (radiansToDegrees(Math.atan2(y, x)) + 360) % 360;
  }

  function degreesToRadians(value) {
    return value * Math.PI / 180;
  }

  function radiansToDegrees(value) {
    return value * 180 / Math.PI;
  }

  function clearRouteLayers() {
    if (state.routeLayer) {
      state.routeLayer.eachLayer((layer) => {
        if (layer.closeTooltip) layer.closeTooltip();
        if (layer.unbindTooltip) layer.unbindTooltip();
      });
      state.routeLayer.clearLayers();
    }

    document.querySelectorAll(".route-tooltip").forEach((tooltip) => tooltip.remove());
    state.pointMarkers = [];
    state.routeLine = null;
    state.routeProgressLine = null;
    state.routeMetrics = null;
    state.vehicleMarker = null;
  }

  function renderMedia(index) {
    const group = mediaGroupForIndex(index);
    const key = `${group.start}-${group.end}`;
    if (state.mediaGroupKey === key) {
      state.mediaGroup = group;
      return;
    }

    elements.stageMedia.innerHTML = state.data.scenes
      .slice(group.start, group.end + 1)
      .map((scene, offset) => `
        <section class="stage-media-scene" data-stage-media-index="${group.start + offset}">
          ${mediaSceneMarkup(scene)}
        </section>
      `).join("");
    elements.stageMedia.scrollTop = 0;
    state.mediaGroup = group;
    state.mediaGroupKey = key;
    restartMediaReveal();
  }

  function mediaSceneMarkup(scene) {
    const media = sceneMedia(scene);
    const lead = media[0];
    const supporting = media.slice(1, 7);
    const highlights = Array.isArray(scene.spotlight) && scene.spotlight.length > 0 ? `
      <div class="stage-highlights">
        ${scene.spotlight.map((item) => stageHighlightMarkup(item)).join("")}
      </div>
    ` : "";
    const sections = scene.sections ? `
      <div class="stage-sections">
        ${scene.sections.map((section) => `
          <section>
            <h3>${escapeHtml(section.title)}</h3>
            ${listMarkup(section.items)}
          </section>
        `).join("")}
      </div>
    ` : "";
    const tips = scene.tips ? `
      <div class="stage-tips">
        <h3>Tips</h3>
        ${listMarkup(scene.tips)}
      </div>
    ` : "";

    return `
      <div class="stage-media-grid">
        <figure class="media-hero">
          <img src="${escapeAttribute(lead.image)}" alt="${escapeAttribute(lead.title)}" loading="lazy" decoding="async">
          <figcaption>
            <span>${escapeHtml(lead.kind)}</span>
            <strong>${escapeHtml(lead.title)}</strong>
            ${lead.description ? `<p>${escapeHtml(lead.description)}</p>` : ""}
          </figcaption>
        </figure>
        <div class="media-stack">
          ${supporting.map((item) => `
            <figure>
              <img src="${escapeAttribute(item.image)}" alt="${escapeAttribute(item.title)}" loading="lazy" decoding="async">
              ${item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : ""}
            </figure>
          `).join("")}
        </div>
      </div>
      <p class="stage-summary">${escapeHtml(scene.summary)}</p>
      ${highlights}
      ${sections}
      ${tips}
    `;
  }

  function mediaGroupForIndex(index) {
    let start = index;
    let end = index;
    while (start > 0 && stageType(state.data.scenes[start - 1]) === "media") {
      start -= 1;
    }
    while (end < state.data.scenes.length - 1 && stageType(state.data.scenes[end + 1]) === "media") {
      end += 1;
    }

    return { start, end };
  }

  function mediaGroupProgress(group) {
    const firstScene = document.querySelector(`[data-scene-index="${group.start}"]`);
    const lastScene = document.querySelector(`[data-scene-index="${group.end}"]`);
    if (!firstScene || !lastScene) return 0;

    const firstRect = firstScene.getBoundingClientRect();
    const lastRect = lastScene.getBoundingClientRect();
    const groupTop = firstRect.top;
    const groupHeight = Math.max(lastRect.bottom - groupTop, 1);
    const startLine = progressStartLine(group.start);
    const endLine = progressEndLine(group.end);
    const distance = Math.max(groupHeight + startLine - endLine, 1);

    return clamp((startLine - groupTop) / distance, 0, 1);
  }

  function stageType(scene) {
    return scene?.type === "transport" ? "map" : "media";
  }

  function restartMediaReveal() {
    elements.stageMedia.classList.remove("is-refreshing");
    void elements.stageMedia.offsetWidth;
    elements.stageMedia.classList.add("is-refreshing");
  }

  function sceneMedia(scene) {
    if (Array.isArray(scene.spotlight) && scene.spotlight.length > 0) {
      return scene.spotlight.map((item, index) => ({
        image: item.image,
        kind: item.kind || "推荐",
        title: item.title || scene.title,
        description: item.description || "",
        caption: item.caption || (index === 0 ? "" : item.kind || "")
      }));
    }

    return (scene.images || [scene.background.image]).map((item, index) => {
      const image = typeof item === "string" ? item : item.image;
      const kind = typeof item === "string" ? scene.mode || scene.type || "推荐" : item.kind || scene.mode || scene.type || "推荐";
      const title = typeof item === "string" ? scene.title : item.title || scene.title;
      const description = typeof item === "string" && index === 0 ? scene.summary : item.description || "";
      const caption = typeof item === "string" ? (index === 0 ? "" : kind) : item.caption || (index === 0 ? "" : kind);

      return { image, kind, title, description, caption };
    });
  }

  function highlightMarkup(item) {
    return `<article class="highlight-item">
      <span>${escapeHtml(item.kind || "推荐")}</span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.description)}</p>
      </div>
    </article>`;
  }

  function stageHighlightMarkup(item) {
    return `<article class="stage-highlight">
      <img src="${escapeAttribute(item.image)}" alt="${escapeAttribute(item.title)}" loading="lazy" decoding="async">
      <div>
        <span>${escapeHtml(item.kind || "推荐")}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.description)}</p>
      </div>
    </article>`;
  }

  function routeColor(mode) {
    if (mode === "flight") return "#8bc9c3";
    if (mode === "train") return "#e9c98f";
    if (mode === "local") return "#d99ba5";
    return "#f5efe7";
  }

  function primarySceneForDate(date, scenes) {
    const value = dateValue(date);
    const matches = scenes.filter((scene) => dateInside(value, scene.startDate, scene.endDate));
    return matches.find((scene) => scene.type === "city")
      || matches.find((scene) => scene.type === "country")
      || matches[0];
  }

  function railLabel(scene) {
    if (scene.mode === "flight") return "飞行";
    if (scene.mode === "train") return "火车";
    if (scene.mode === "local") return "市内";
    const [label] = scene.title.split(/[：:]/);
    return label.length > 7 ? label.slice(0, 7) : label;
  }

  function dateRange(startDate, endDate) {
    const dates = [];
    let cursor = dateValue(startDate);
    const end = dateValue(endDate);
    while (cursor <= end) {
      dates.push(toDateString(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }

  function dateInside(date, startDate, endDate) {
    return date >= dateValue(startDate) && date <= dateValue(endDate);
  }

  function dateValue(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  function toDateString(date) {
    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
  }

  function formatMonthDay(date) {
    const [, month, day] = date.split("-");
    return `${Number(month)}/${Number(day)}`;
  }

  function weekdayLabel(date) {
    return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][dateValue(date).getUTCDay()];
  }

  function listMarkup(items) {
    return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function toCamel(value) {
    return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
