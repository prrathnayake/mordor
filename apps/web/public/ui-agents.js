// ===== NewsExplorer Agent =====
// Trigger: user clicks a news article in the news panel
// Action: fetch graph entities by article URL/title, query relationships, render on globe
class NewsExplorerAgent {
  shouldTrigger(event, _history) {
    return event.type === "news_click";
  }

  async execute(event, runtime) {
    const data = event.data || {};
    const url = data.url || "";
    const title = data.title || "";

    let entities = await runtime.fetchGraph(
      `/graph/entities?source=${encodeURIComponent(url || title)}`,
    );
    if (!entities?.length) {
      entities = await runtime.fetchGraph(`/graph/entities?q=${encodeURIComponent(title)}`);
    }
    if (!entities?.length) return;

    const firstEntity = entities[0];
    if (firstEntity && firstEntity.lon != null && firstEntity.lat != null) {
      runtime.createMapPin(firstEntity.lon, firstEntity.lat, {
        color: "#ff6600",
        label: firstEntity.name || firstEntity.id || title,
        pixelSize: 12,
        outlineColor: "#ff6600",
        outlineWidth: 3,
        properties: { source: "news-explorer", entityId: firstEntity.id },
      });
    }

    const relationships = await runtime.fetchGraph(
      `/graph/entities/${firstEntity.id}/relationships`,
    );
    if (relationships?.length) {
      let colorIdx = 0;
      const colors = ["#00ff41", "#00ccff", "#ffcc00", "#ff66ff", "#66ffcc"];
      for (let i = 0; i < relationships.length; i++) {
        const rel = relationships[i];
        if (rel.lon != null && rel.lat != null) {
          runtime.createMapPin(rel.lon, rel.lat, {
            color: colors[colorIdx % colors.length],
            label: rel.name || rel.id,
            pixelSize: 8,
            outlineWidth: 1,
          });
          colorIdx++;
        }
        if (
          firstEntity.lon != null &&
          firstEntity.lat != null &&
          rel.lon != null &&
          rel.lat != null
        ) {
          runtime.drawRouteLine(firstEntity.lon, firstEntity.lat, rel.lon, rel.lat, {
            color: colors[(colorIdx - 1) % colors.length],
            width: 1.5,
            dashed: true,
          });
        }
      }
    }
  }
}

// ===== EntityLinker Agent =====
// Trigger: user selects an object on the Cesium globe
// Action: fetch entity relationships from graph API, render connected entities
class EntityLinkerAgent {
  shouldTrigger(event, _history) {
    return event.type === "entity_select";
  }

  async execute(event, runtime) {
    const data = event.data || {};
    const entityId = data.entityId;
    if (!entityId) return;

    const relationships = await runtime.fetchGraph(
      `/graph/entities/${encodeURIComponent(entityId)}/relationships`,
    );
    if (!relationships?.length) return;

    const _sourceEntity = null;
    let sourceData = event.position;
    if (runtime.cesiumViewer && typeof Cesium !== "undefined") {
      const entity = runtime.cesiumViewer.entities.getById(entityId);
      if (entity?.position) {
        const cartographic = Cesium.Cartographic.fromCartesian(
          entity.position.getValue(Cesium.JulianDate.now()),
        );
        sourceData = {
          lon: Cesium.Math.toDegrees(cartographic.longitude),
          lat: Cesium.Math.toDegrees(cartographic.latitude),
        };
      }
    }

    const colors = ["#00ff41", "#00ccff", "#ffcc00", "#ff66ff", "#66ffcc", "#ff4444", "#44ff44"];
    for (let i = 0; i < relationships.length; i++) {
      const rel = relationships[i];
      if (rel.lon == null || rel.lat == null) continue;

      const color = colors[i % colors.length];
      runtime.createMapPin(rel.lon, rel.lat, {
        color: color,
        label: rel.name || rel.id || `Entity ${i + 1}`,
        pixelSize: 9,
        outlineColor: color,
        outlineWidth: 2,
        properties: {
          source: "entity-linker",
          relationshipId: rel.relationship_id || rel.id,
          relationshipType: rel.type || "related",
        },
      });

      if (sourceData && sourceData.lon != null && sourceData.lat != null) {
        runtime.drawRouteLine(sourceData.lon, sourceData.lat, rel.lon, rel.lat, {
          color: color,
          width: 2,
          dashed: true,
          properties: {
            source: "entity-linker",
            relationshipType: rel.type || "related",
          },
        });
      }
    }

    if (sourceData) {
      runtime.flyTo(sourceData.lat, sourceData.lon, 50000, 2);
    }
  }
}

// ===== EventSequencer Agent =====
// Trigger: user inspects an alert or incident
// Action: fetch causal chain from graph, render as timeline + globe animation
class EventSequencerAgent {
  shouldTrigger(event, _history) {
    return event.type === "alert_inspect" || event.type === "incident_open";
  }

  async execute(event, runtime) {
    const data = event.data || {};
    const entityId = data.alertId || data.incidentId;
    if (!entityId) return;

    const chain = await runtime.fetchGraph(
      `/graph/chains/from/${encodeURIComponent(entityId)}?depth=10`,
    );
    if (!chain?.steps?.length) return;

    const eventLog = document.getElementById("event-list");
    if (eventLog) {
      let html = "";
      for (let i = 0; i < chain.steps.length; i++) {
        const step = chain.steps[i];
        const timeStr = step.timestamp || `T+${i}`;
        html +=
          '<li class="event-item" data-step="' +
          i +
          '">' +
          '<span class="event-time">' +
          escapeHtml(timeStr) +
          "</span>" +
          '<span class="event-label">' +
          escapeHtml(step.label || step.type || `Step ${i + 1}`) +
          "</span>" +
          "</li>";
      }
      eventLog.innerHTML = html;
    }

    const insightLog = document.getElementById("insight-log");
    if (insightLog) {
      let insightHtml =
        '<div class="insight-entry causal-chain">' +
        '<span class="insight-label">CAUSAL CHAIN</span>' +
        '<span class="insight-value">' +
        chain.steps.length +
        " steps</span>" +
        "</div>";
      if (chain.root_cause) {
        insightHtml +=
          '<div class="insight-entry root-cause">' +
          '<span class="insight-label">ROOT CAUSE</span>' +
          '<span class="insight-value">' +
          escapeHtml(chain.root_cause) +
          "</span>" +
          "</div>";
      }
      insightLog.insertAdjacentHTML("beforeend", insightHtml);
    }

    const geoSteps = chain.steps.filter((s) => s.lon != null && s.lat != null);
    if (geoSteps.length && runtime.cesiumViewer && typeof Cesium !== "undefined") {
      const colors = ["#ff4444", "#ff8800", "#ffcc00", "#44cc44", "#44ccff", "#8844ff"];
      const polyPositions = [];

      for (let j = 0; j < geoSteps.length; j++) {
        const step = geoSteps[j];
        const color = colors[j % colors.length];
        runtime.createMapPin(step.lon, step.lat, {
          color: color,
          label: step.label || `Step ${j + 1}`,
          pixelSize: 11,
          outlineColor: "#ffffff",
          outlineWidth: 2,
          properties: {
            source: "event-sequencer",
            stepIndex: j,
            stepType: step.type || "event",
          },
        });
        polyPositions.push(step.lon);
        polyPositions.push(step.lat);
      }

      if (polyPositions.length >= 4) {
        const polyEntity = runtime.cesiumViewer.entities.add({
          id: runtime.nextEntityId("chain-poly"),
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(polyPositions),
            width: 3,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.3,
              color: Cesium.Color.fromCssColorString("#ff4444"),
            }),
            arcType: Cesium.ArcType.GEODESIC,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000000),
          },
        });
        runtime.entityCache.set(polyEntity.id, polyEntity);
      }

      const firstStep = geoSteps[0];
      runtime.flyTo(firstStep.lat, firstStep.lon, 30000, 2.5);
    }
  }
}

// ===== ContextProber Agent =====
// Trigger: user performs a search
// Action: query graph entities by name/text, render matching entities as pins
class ContextProberAgent {
  shouldTrigger(event, _history) {
    return event.type === "search";
  }

  async execute(event, runtime) {
    const data = event.data || {};
    const query = data.query;
    if (!query || query.length < 3) return;

    const entities = await runtime.fetchGraph(`/graph/entities?q=${encodeURIComponent(query)}`);
    if (!entities?.length) return;

    const colors = ["#00ff41", "#00ccff", "#ffcc00", "#ff66ff", "#66ffcc"];
    let colorIdx = 0;
    const entityList = document.getElementById("entity-list");
    let entityHtml = "";

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      if (entity.lon == null || entity.lat == null) continue;

      const color = colors[colorIdx % colors.length];
      colorIdx++;

      runtime.createMapPin(entity.lon, entity.lat, {
        color: color,
        label: entity.name || entity.id || entity.type || "Entity",
        pixelSize: 10,
        outlineColor: color,
        outlineWidth: 2,
        properties: {
          source: "context-prober",
          entityId: entity.id,
          type: entity.type || "unknown",
        },
      });

      entityHtml +=
        '<div class="entity-item" data-entity-id="' +
        escapeAttr(entity.id) +
        '">' +
        '<span class="entity-name" style="color:' +
        color +
        '">' +
        escapeHtml(entity.name || entity.id) +
        "</span>" +
        '<span class="entity-type">' +
        escapeHtml(entity.type || "") +
        "</span>" +
        "</div>";
    }

    if (entityHtml && entityList) {
      entityList.innerHTML = entityHtml;
      entityList.querySelectorAll(".entity-item").forEach((el) => {
        el.addEventListener("click", () => {
          const eid = el.dataset.entityId;
          if (typeof window.selectObject === "function") {
            window.selectObject(eid);
          }
        });
      });
    }

    const firstEntity = entities[0];
    if (firstEntity && firstEntity.lon != null && firstEntity.lat != null) {
      runtime.flyTo(firstEntity.lat, firstEntity.lon, 50000, 2);
    }
  }
}
