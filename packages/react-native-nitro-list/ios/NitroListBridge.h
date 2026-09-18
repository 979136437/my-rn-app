#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@protocol NitroListNativeController <NSObject>
- (void)attachList:(id)list;
- (void)detachList:(id)list;
@end

@protocol NitroListSnapshotSink <NSObject>
- (void)publishSnapshot:(NSArray<NSDictionary<NSString *, id> *> *)slots createdCells:(double)createdCells rebinds:(double)rebinds;
@end

@protocol NitroListSurfaceDelegate <NSObject>
- (void)emitListEvent:(NSString *)name payload:(NSDictionary<NSString *, id> *)payload;
- (void)refreshSlotOffsets;
@end

@interface NitroListBridge : NSObject
+ (void)connect:(id<NitroListNativeController>)controller listId:(NSString *)listId;
+ (void)disconnect:(id<NitroListNativeController>)controller listId:(NSString *)listId;
+ (nullable id)listForId:(NSString *)listId;
+ (void)registerList:(id)list listId:(NSString *)listId;
+ (void)unregisterList:(id)list listId:(NSString *)listId;
@end

@protocol NitroListNativeView <NSObject>
@property (nonatomic, weak, nullable) id<NitroListSnapshotSink> snapshotSink;
@property (nonatomic, weak, nullable) id<NitroListSurfaceDelegate> eventDelegate;
- (void)mountSlot:(UIView *)view slotId:(NSString *)slotId accessoryRole:(NSString *)accessoryRole token:(double)token version:(double)version;
- (void)unmountSlot:(UIView *)view slotId:(NSString *)slotId;
- (void)configureList:(NSDictionary<NSString *, id> *)config;
- (void)setListItems:(NSArray<NSDictionary<NSString *, id> *> *)items;
- (void)setListRefreshing:(BOOL)refreshing;
- (void)resolveEndReached:(double)requestId accepted:(BOOL)accepted;
- (void)reportMeasurement:(NSString *)slotId token:(double)token version:(double)version width:(double)width height:(double)height;
- (void)scrollToOffset:(double)offset animated:(BOOL)animated;
- (void)scrollToEnd:(BOOL)animated;
- (void)scrollBy:(double)delta animated:(BOOL)animated;
- (void)scrollToItem:(NSString *)key animated:(BOOL)animated align:(NSString *)align offset:(double)offset avoidHeaders:(BOOL)avoidHeaders;
- (void)stopScroll;
- (NSDictionary<NSString *, id> *)scrollMetrics;
@end

NS_ASSUME_NONNULL_END
