import { cacheMiddleware, multipleMiddleware } from "@/middleware/http";
import { useWatcher } from "alova/client";
import { useMemo } from "react";
import http from "./alova";

export interface ScenicDetail {
  scenicId: number;
  title: string;
  image: string;
  topImage: string;
  shareImage: string;
  bgcolor: string;
  pageBgColor: string;
  bottomBgColor: string;
  appid: string;
  mapUrl: string;
  mapStatus: number;
  reserveUrl: string;
  parkReserveUrl: string;
  address: string;
  phone: string;
  grade: string;
  content: string;
  province: string;
  provincecode: string;
  city: string;
  citycode: string;
  lat: string;
  lng: string;
  zoom: number;
  weigh: number;
  status: number;
  brandId: string;
  createdAt: string;
  updatedAt: string;
  reserveAppid: string;
  parkReserveAppid: string;
  myAppid: string;
  myUrl: string;
  subscribeAppid: string;
  subscribeUrl: string;
  yearcardAppid: string;
  yearcardUrl: string;
  mchId: string;
  umappkey: string;
  template: number;
  homepageTemplate: number;
  cityTitleStyle: number;
  sectionTitleColor: string;
  buyButtonShow: number;
  buyButtonBg: string;
  buyButtonList: string;
  isView: string;
  parentId: number;
  centerLng: string;
  centerLat: string;
  centerZoom: number;
  isMourning: number;
  nightEnable: number;
  nightStartTime: string;
  nightEndTime: string;
}

export function useGetScenicDetail(id: number) {
  const middleware = useMemo(() => multipleMiddleware([cacheMiddleware()]), []);
  return useWatcher(
    () =>
      http.Get<ScenicDetail>(`/api/scenic/getScenicDetail`, {
        params: {
          scenic_id: id,
        },
      }),
    [id],
    {
      middleware,
      initialData: {},
      immediate: true,
    },
  );
}
