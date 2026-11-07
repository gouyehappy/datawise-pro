package org.apache.datawise.backend.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class TeamEntity {

    private String id;

    private String name;

    private Long ownerUserId;

    /** 所属租户；缺失时按 default 处理。 */
    private String tenantId;

    private String inviteCode;

    private Instant createdAt;

    private List<String> sharedConnectionIds = new ArrayList<>();

    /** 值班连接包：须为 sharedConnectionIds 的子集 */
    private List<String> onCallConnectionIds = new ArrayList<>();

    /** connectionId → read | write（仅对 member 生效；viewer 恒为 read，admin/owner 恒为 write） */
    private Map<String, String> sharedConnectionAccess = new HashMap<>();

    private List<String> sharedConsoleIds = new ArrayList<>();

    /**
     * 团队可见项目子集；空 = 不限制（见全部租户项目）。
     * 若用户所属团队均配置了非空列表，则列表取并集后过滤。
     */
    private List<String> visibleProjectIds = new ArrayList<>();

    private boolean shareSqlHistory;

    private boolean requireInviteApproval;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public Long getOwnerUserId() {
        return ownerUserId;
    }

    public void setOwnerUserId(Long ownerUserId) {
        this.ownerUserId = ownerUserId;
    }

    public String getTenantId() {
        return tenantId;
    }

    public void setTenantId(String tenantId) {
        this.tenantId = tenantId;
    }

    public String getInviteCode() {
        return inviteCode;
    }

    public void setInviteCode(String inviteCode) {
        this.inviteCode = inviteCode;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public List<String> getSharedConnectionIds() {
        if (sharedConnectionIds == null) {
            sharedConnectionIds = new ArrayList<>();
        }
        return sharedConnectionIds;
    }

    public void setSharedConnectionIds(List<String> sharedConnectionIds) {
        this.sharedConnectionIds = sharedConnectionIds != null ? sharedConnectionIds : new ArrayList<>();
    }

    public List<String> getOnCallConnectionIds() {
        if (onCallConnectionIds == null) {
            onCallConnectionIds = new ArrayList<>();
        }
        return onCallConnectionIds;
    }

    public void setOnCallConnectionIds(List<String> onCallConnectionIds) {
        this.onCallConnectionIds = onCallConnectionIds != null ? onCallConnectionIds : new ArrayList<>();
    }

    public Map<String, String> getSharedConnectionAccess() {
        if (sharedConnectionAccess == null) {
            sharedConnectionAccess = new HashMap<>();
        }
        return sharedConnectionAccess;
    }

    public void setSharedConnectionAccess(Map<String, String> sharedConnectionAccess) {
        this.sharedConnectionAccess = sharedConnectionAccess != null ? sharedConnectionAccess : new HashMap<>();
    }

    public List<String> getSharedConsoleIds() {
        if (sharedConsoleIds == null) {
            sharedConsoleIds = new ArrayList<>();
        }
        return sharedConsoleIds;
    }

    public void setSharedConsoleIds(List<String> sharedConsoleIds) {
        this.sharedConsoleIds = sharedConsoleIds != null ? sharedConsoleIds : new ArrayList<>();
    }

    public List<String> getVisibleProjectIds() {
        if (visibleProjectIds == null) {
            visibleProjectIds = new ArrayList<>();
        }
        return visibleProjectIds;
    }

    public void setVisibleProjectIds(List<String> visibleProjectIds) {
        this.visibleProjectIds = visibleProjectIds != null ? visibleProjectIds : new ArrayList<>();
    }

    public boolean isShareSqlHistory() {
        return shareSqlHistory;
    }

    public void setShareSqlHistory(boolean shareSqlHistory) {
        this.shareSqlHistory = shareSqlHistory;
    }

    public boolean isRequireInviteApproval() {
        return requireInviteApproval;
    }

    public void setRequireInviteApproval(boolean requireInviteApproval) {
        this.requireInviteApproval = requireInviteApproval;
    }
}
