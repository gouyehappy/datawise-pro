package org.apache.datawise.backend.domain.communityplugin;

public record CommunityPluginInstallResponseDto(
        CommunityPluginInfoDto plugin,
        String previousVersion,
        String packageSha256,
        boolean signed) {

    public static CommunityPluginInstallResponseDto from(CommunityPluginInstallResult result) {
        return new CommunityPluginInstallResponseDto(
                CommunityPluginInfoDto.from(result.plugin()),
                result.previousVersion(),
                result.packageSha256(),
                result.signed());
    }
}
