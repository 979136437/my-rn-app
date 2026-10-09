import "alova";

declare module "alova" {
  export interface AlovaCustomTypes {
    meta: {
      NeedLogin?: true;
      NoHandle?: true;
    };
  }
}
