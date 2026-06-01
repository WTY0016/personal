(function () {
  const DATA_URL = "data/journey.json";
  const state = {
    data: null,
    activeIndex: 0,
    map: null,
    routeLayer: null,
    routeLine: null,
    pointMarkers: [],
    vehicleMarker: null,
    activeBackgroundLayer: 0,
    ticking: false
  };

  const elements = {};

  document.addEventListener("DOMContentLoaded", boot);

  async function boot() {
    cacheElements();
    setupScrollProgress();

    try {
      state.data = await fetchJson(DATA_URL);
      renderDateRail(state.data.meta);
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
      "stage-map",
      "stage-media",
      "stage-caption",
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

  function renderDateRail(meta) {
    const dates = dateRange(meta.startDate, meta.endDate);
    const first = formatMonthDay(meta.startDate);
    const last = formatMonthDay(meta.endDate);
    elements.railRange.textContent = `${first} - ${last}`;
    elements.dateList.innerHTML = dates.map((date) => {
      return `<button type="button" class="date-node" data-date="${date}">
        <span>${formatMonthDay(date)}</span>
        <strong>${weekdayLabel(date)}</strong>
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
      const imageStrip = scene.images ? `
        <div class="scene-images">
          ${scene.images.map((image, imageIndex) => `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(scene.title)} ${imageIndex + 1}" loading="lazy" decoding="async">`).join("")}
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
        ${imageStrip}
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
      scrollWheelZoom: false,
      attributionControl: true
    }).setView([48.8, 18], 4);

    L.control.zoom({ position: "bottomright" }).addTo(state.map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(state.map);

    state.routeLayer = L.layerGroup().addTo(state.map);
  }

  function setupSceneObserver() {
    const scenes = document.querySelectorAll(".story-scene");
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (visible) {
        setActiveScene(Number(visible.target.dataset.sceneIndex));
      }
    }, {
      threshold: [0.32, 0.48, 0.62],
      rootMargin: "-16% 0px -20% 0px"
    });

    scenes.forEach((scene) => observer.observe(scene));
  }

  function setupScrollProgress() {
    const update = () => {
      if (state.ticking) return;
      state.ticking = true;
      requestAnimationFrame(() => {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const progress = maxScroll > 0 ? window.scrollY / maxScroll : 0;
        elements.scrollProgressBar.style.transform = `scaleX(${progress})`;
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
    elements.stageMap.classList.toggle("is-visible", isTransport);
    elements.stageMedia.classList.toggle("is-visible", !isTransport);

    if (isTransport) {
      renderRoute(scene);
    } else {
      renderMedia(scene);
    }

    elements.stageCaption.innerHTML = `
      <span>${escapeHtml(scene.eyebrow)}</span>
      <strong>${escapeHtml(scene.title)}</strong>
    `;
  }

  function renderRoute(scene) {
    if (!state.map || !scene.map) return;

    clearRouteLayers();

    const points = scene.map.points.map((point) => [point.lat, point.lng]);
    const color = routeColor(scene.mode);

    state.routeLine = L.polyline(points, {
      color,
      weight: scene.mode === "flight" ? 3 : 4,
      opacity: 0.95,
      dashArray: scene.mode === "flight" ? "10 12" : scene.mode === "local" ? "6 8" : null,
      className: `route-line route-${scene.mode}`
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

    const vehiclePoint = points[Math.floor(points.length / 2)];
    state.vehicleMarker = L.marker(vehiclePoint, {
      icon: L.divIcon({
        html: `<span>${escapeHtml(scene.map.vehicle)}</span>`,
        className: `vehicle-icon vehicle-${scene.mode}`,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      })
    }).addTo(state.routeLayer);

    const bounds = L.latLngBounds(points);
    state.map.fitBounds(bounds, {
      padding: scene.mode === "flight" ? [42, 42] : [70, 70],
      maxZoom: scene.mode === "local" ? 13 : scene.mode === "train" ? 7 : 4
    });

    setTimeout(() => state.map.invalidateSize(), 80);
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
    state.vehicleMarker = null;
  }

  function renderMedia(scene) {
    const images = scene.images || [scene.background.image];
    const lead = images[0] || scene.background.image;
    const supporting = images.slice(1, 4);

    elements.stageMedia.innerHTML = `
      <div class="media-hero">
        <img src="${escapeAttribute(lead)}" alt="${escapeAttribute(scene.title)}" loading="lazy" decoding="async">
      </div>
      <div class="media-stack">
        ${supporting.map((image, index) => `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(scene.title)} ${index + 2}" loading="lazy" decoding="async">`).join("")}
      </div>
    `;
  }

  function routeColor(mode) {
    if (mode === "flight") return "#8bc9c3";
    if (mode === "train") return "#e9c98f";
    if (mode === "local") return "#d99ba5";
    return "#f5efe7";
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
