"""
transforms.py
-------------
The train/val image transforms, on their own.

They used to live in core/utils.py, which imports matplotlib, imagehash,
tqdm and scikit-learn's splitters at module level. The predictor needs
nothing from that beyond these two pipelines, so importing it dragged the
entire training and plotting stack into the serving path -- about 2 GB of
container image, and a build that broke whenever a reporting dependency
did. core/utils.py re-exports from here, so existing imports still work.
"""

import torchvision.transforms as transforms


def get_transforms(img_size=288):
    train_transform = transforms.Compose([
        transforms.Resize((img_size + 32, img_size + 32)),
        transforms.RandomCrop((img_size, img_size)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(p=0.2),
        transforms.RandAugment(),
        transforms.RandomApply([transforms.GaussianBlur(kernel_size=3)], p=0.2),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    val_transform = transforms.Compose([
        transforms.Resize((img_size + 32, img_size + 32)),
        transforms.CenterCrop((img_size, img_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    return train_transform, val_transform
