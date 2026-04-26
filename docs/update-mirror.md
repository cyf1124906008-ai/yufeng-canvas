# YUFENG Canvas 国内更新镜像说明

YUFENG Canvas 使用 `electron-updater` 更新。GitHub Release 可以作为默认更新源，但国内用户可能无法稳定访问 GitHub，所以建议额外准备一个国内静态镜像源。

## 镜像目录需要上传的文件

每次发布后，把 `release/` 目录里的这些文件同步到同一个静态目录：

```text
latest.yml
YUFENG-Canvas-Setup-x.y.z.exe
YUFENG-Canvas-Setup-x.y.z.exe.blockmap
YUFENG-Canvas-Latest.exe
```

其中 `latest.yml` 和版本号安装包是自动更新必须文件，`YUFENG-Canvas-Latest.exe` 是给官网/社群直接下载用的固定入口。

## 镜像 URL 规则

如果你的静态目录是：

```text
https://cdn.example.com/yufeng-canvas/
```

那么下面这些地址必须能直接访问：

```text
https://cdn.example.com/yufeng-canvas/latest.yml
https://cdn.example.com/yufeng-canvas/YUFENG-Canvas-Setup-x.y.z.exe
https://cdn.example.com/yufeng-canvas/YUFENG-Canvas-Setup-x.y.z.exe.blockmap
```

## 配置客户端优先使用国内源

编辑 `package.json`：

```json
{
  "yufeng": {
    "updateMirrors": [
      "https://cdn.example.com/yufeng-canvas"
    ]
  }
}
```

重新打包后，客户端会按顺序检查：

```text
国内镜像 1 -> 国内镜像 2 -> GitHub Release
```

如果国内源不可用，会自动退回 GitHub。

## 临时测试镜像源

开发或临时构建时，也可以用环境变量覆盖：

```powershell
$env:YUFENG_UPDATE_MIRROR_URL="https://cdn.example.com/yufeng-canvas"
pnpm desktop:dist
```

多个镜像源用英文逗号分隔。

## 推荐部署位置

- 阿里云 OSS + CDN
- 腾讯云 COS + CDN
- 七牛云对象存储
- 又拍云
- 自有服务器 Nginx 静态目录

只要能稳定提供静态文件下载，就可以作为更新镜像。
