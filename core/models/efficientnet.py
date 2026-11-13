import torch
import torch.nn as nn
from torchvision import models

class EfficientNetClassifier(nn.Module):
    def __init__(self, num_classes=2, freeze_backbone=True, pretrained=True):
        super(EfficientNetClassifier, self).__init__()

        # pretrained=False for inference: a checkpoint is loaded over every
        # weight a moment later, so fetching ImageNet first is a download
        # and a network dependency on every cold start, for nothing. It
        # also crashed in a container, where the service user has no
        # writable torch cache.
        weights = models.EfficientNet_B2_Weights.IMAGENET1K_V1 if pretrained else None
        self.model = models.efficientnet_b2(weights=weights)
        num_ftrs = self.model.classifier[1].in_features
        self.model.classifier[1] = nn.Linear(num_ftrs, num_classes)
        
        self._backbone_frozen = False
        if freeze_backbone:
            self.freeze_backbone()

    def freeze_backbone(self):
        self._backbone_frozen = True
        # Freeze all layers
        for param in self.model.parameters():
            param.requires_grad = False
        # Unfreeze only the classifier
        for param in self.model.classifier.parameters():
            param.requires_grad = True
            
    def unfreeze_backbone(self):
        self._backbone_frozen = False
        # Unfreeze all layers
        for param in self.model.parameters():
            param.requires_grad = True


    def train(self, mode: bool = True):
        """
        Keep frozen BatchNorm layers in eval mode.

        requires_grad=False stops gradients but does NOT stop BatchNorm from
        updating its running mean/var in train() mode. The stage-1 "frozen"
        backbone was therefore still drifting on every forward pass. When the
        backbone is frozen we put its BN layers in eval so the pretrained
        statistics are genuinely held fixed.
        """
        super().train(mode)
        if mode and self._backbone_frozen:
            for m in self.model.modules():
                if isinstance(m, nn.modules.batchnorm._BatchNorm):
                    m.eval()
        return self

    def forward(self, x):
        return self.model(x)
