import type { AlertBadgeData, BadgeConfig } from "./alert-badge-widget.js";
import { AlertBadgeWidget } from "./alert-badge-widget.js";
import { BaseWidget, type BaseWidgetConfig, type Position } from "./base-widget.js";
import type { ClusterConfig, ClusterData } from "./cluster-widget.js";
import { ClusterWidget } from "./cluster-widget.js";
import type { CardConfig, InfoCardData } from "./info-card-widget.js";
import { InfoCardWidget } from "./info-card-widget.js";
import type { RouteConfig, RouteLineData } from "./route-line-widget.js";
import { RouteLineWidget } from "./route-line-widget.js";
import type { TooltipConfig, TooltipData } from "./tooltip-widget.js";
import { TooltipWidget } from "./tooltip-widget.js";

export interface CategoryIcon {
  icon: string;
  color: string;
}

export const CATEGORY_ICONS: Record<string, CategoryIcon> = {
  aviation: { icon: "✈", color: "#38bdf8" },
  weather: { icon: "🌤", color: "#22d3ee" },
  space: { icon: "🛰", color: "#a78bfa" },
  security: { icon: "🔒", color: "#f87171" },
  news: { icon: "📰", color: "#f59e0b" },
  finance: { icon: "💰", color: "#4ade80" },
  social: { icon: "💬", color: "#60a5fa" },
  seismic: { icon: "📡", color: "#fb923c" },
  maritime: { icon: "🚢", color: "#0ea5e9" },
  custom: { icon: "🎯", color: "#e879f9" },
};

export class WidgetFactory {
  static createTooltip(config: Omit<TooltipConfig, never>): TooltipWidget {
    return new TooltipWidget(config);
  }

  static createInfoCard(config: Omit<CardConfig, never>): InfoCardWidget {
    return new InfoCardWidget(config);
  }

  static createCluster(config: Omit<ClusterConfig, never>): ClusterWidget {
    return new ClusterWidget(config);
  }

  static createAlertBadge(config: Omit<BadgeConfig, never>): AlertBadgeWidget {
    return new AlertBadgeWidget(config);
  }

  static createRouteLine(config: Omit<RouteConfig, never>): RouteLineWidget {
    return new RouteLineWidget(config);
  }

  static getCategoryIcon(category: string): CategoryIcon {
    return CATEGORY_ICONS[category] || CATEGORY_ICONS.custom;
  }

  static createLayerMarker(
    layerId: string,
    item: Record<string, unknown>,
    position: Position,
  ): TooltipWidget {
    const categoryInfo = WidgetFactory.getCategoryIcon(layerId);
    const label = WidgetFactory.getItemLabel(layerId, item);

    return WidgetFactory.createTooltip({
      id: `tooltip-${layerId}-${item.id || Math.random().toString(36).slice(2, 8)}`,
      layerId,
      position,
      data: {
        title: label,
        subtitle: (item.callsign as string) || (item.title as string)?.slice(0, 40) || undefined,
        icon: categoryInfo.icon,
        color: categoryInfo.color,
      },
    });
  }

  static createLayerCluster(
    layerId: string,
    items: Array<Record<string, unknown>>,
    position: Position,
    onClick?: (data: ClusterData, position: Position) => void,
  ): ClusterWidget {
    const categoryInfo = WidgetFactory.getCategoryIcon(layerId);

    return WidgetFactory.createCluster({
      id: `cluster-${layerId}-${Date.now()}`,
      layerId,
      position,
      data: {
        count: items.length,
        label: items.length > 999 ? "999+" : String(items.length),
        color: categoryInfo.color,
      },
      onClick,
    });
  }

  static createLayerAlertBadge(
    layerId: string,
    data: AlertBadgeData,
    position: Position,
  ): AlertBadgeWidget {
    return WidgetFactory.createAlertBadge({
      id: `badge-${layerId}-${Date.now()}`,
      layerId,
      position,
      data,
    });
  }

  static createItemInfoCard(
    layerId: string,
    item: Record<string, unknown>,
    position: Position,
    options?: { closable?: boolean; actions?: Array<{ label: string; onClick: () => void }> },
  ): InfoCardWidget {
    const categoryInfo = WidgetFactory.getCategoryIcon(layerId);
    const fields = WidgetFactory.extractFields(layerId, item);

    return WidgetFactory.createInfoCard({
      id: `card-${layerId}-${item.id || Math.random().toString(36).slice(2, 8)}`,
      layerId,
      position,
      data: {
        title: WidgetFactory.getItemLabel(layerId, item),
        subtitle: (item.callsign as string) || undefined,
        fields,
        icon: categoryInfo.icon,
        color: categoryInfo.color,
        severity: WidgetFactory.getItemSeverity(item),
      },
      closable: options?.closable ?? true,
      autoPosition: true,
    });
  }

  static getItemLabel(layerId: string, item: Record<string, unknown>): string {
    switch (layerId) {
      case "aviation":
        return (item.callsign as string) || (item.icao24 as string) || "Unknown Flight";
      case "weather":
        return (item.name as string) || `Weather Station`;
      case "security":
        return (item.ip_address as string) || (item.domain as string) || "Unknown Threat";
      case "space":
        return (item.title as string)?.slice(0, 40) || "Space Event";
      case "news":
        return (item.title as string)?.slice(0, 40) || "News Item";
      case "finance":
        return (item.symbol as string) || "Asset";
      case "social":
        return (item.author as string) || (item.title as string)?.slice(0, 30) || "Post";
      default:
        return (item.name as string) || (item.title as string)?.slice(0, 30) || "Item";
    }
  }

  static getItemSeverity(
    item: Record<string, unknown>,
  ): "info" | "warning" | "critical" | undefined {
    const severity = item.severity as string;
    if (severity === "critical" || severity === "high") return "critical";
    if (severity === "warning" || severity === "medium") return "warning";
    return "info";
  }

  static extractFields(
    layerId: string,
    item: Record<string, unknown>,
  ): Array<{ label: string; value: string | number }> {
    const fields: Array<{ label: string; value: string | number }> = [];

    switch (layerId) {
      case "aviation":
        if (item.altitude_m != null)
          fields.push({ label: "ALT", value: `${item.altitude_m as number}m` });
        if (item.velocity_mps != null)
          fields.push({ label: "SPD", value: `${(item.velocity_mps as number).toFixed(1)}m/s` });
        if (item.heading_deg != null)
          fields.push({ label: "HDG", value: `${item.heading_deg as number}°` });
        break;
      case "weather":
        if (item.temperature_c != null)
          fields.push({ label: "TEMP", value: `${item.temperature_c as number}°C` });
        if (item.humidity != null)
          fields.push({ label: "HUM", value: `${item.humidity as number}%` });
        if (item.wind_speed_mps != null)
          fields.push({ label: "WIND", value: `${item.wind_speed_mps as number}m/s` });
        break;
      case "security":
        if (item.confidence != null)
          fields.push({ label: "CONF", value: `${item.confidence as number}%` });
        if (item.total_reports != null)
          fields.push({ label: "REPORTS", value: item.total_reports as number });
        if (item.port != null) fields.push({ label: "PORT", value: item.port as number });
        break;
      case "space":
        if (item.source != null) fields.push({ label: "SOURCE", value: item.source as string });
        if (item.data_type != null) fields.push({ label: "TYPE", value: item.data_type as string });
        break;
    }

    if (item.lat != null) fields.push({ label: "LAT", value: (item.lat as number).toFixed(4) });
    if (item.lon != null) fields.push({ label: "LON", value: (item.lon as number).toFixed(4) });

    return fields.slice(0, 6);
  }
}
