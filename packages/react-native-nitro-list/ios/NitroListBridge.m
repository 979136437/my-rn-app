#import "NitroListBridge.h"

@implementation NitroListBridge

+ (NSMapTable<NSString *, id<NitroListNativeController>> *)controllers
{
  static NSMapTable *table;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ table = [NSMapTable strongToWeakObjectsMapTable]; });
  return table;
}

+ (NSMapTable<NSString *, id> *)lists
{
  static NSMapTable *table;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ table = [NSMapTable strongToWeakObjectsMapTable]; });
  return table;
}

+ (void)connect:(id<NitroListNativeController>)controller listId:(NSString *)listId
{
  NSAssert(NSThread.isMainThread, @"NitroList registry requires the main thread");
  [self.controllers setObject:controller forKey:listId];
  id list = [self.lists objectForKey:listId];
  if (list) [controller attachList:list];
}

+ (void)disconnect:(id<NitroListNativeController>)controller listId:(NSString *)listId
{
  NSAssert(NSThread.isMainThread, @"NitroList registry requires the main thread");
  if ([self.controllers objectForKey:listId] == controller) {
    id list = [self.lists objectForKey:listId];
    if (list) [controller detachList:list];
    [self.controllers removeObjectForKey:listId];
  }
}

+ (id)listForId:(NSString *)listId { return [self.lists objectForKey:listId]; }

+ (void)registerList:(id)list listId:(NSString *)listId
{
  if (!listId.length) return;
  [self.lists setObject:list forKey:listId];
  [[self.controllers objectForKey:listId] attachList:list];
}

+ (void)unregisterList:(id)list listId:(NSString *)listId
{
  if ([self.lists objectForKey:listId] != list) return;
  [[self.controllers objectForKey:listId] detachList:list];
  [self.lists removeObjectForKey:listId];
}

@end
