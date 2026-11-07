package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.model.UserEntity;

import java.util.List;
import java.util.Optional;

/** Identity users (file or jdbc backend). */
public interface UserStore {

    Optional<UserEntity> findById(Long id);

    UserEntity saveUser(UserEntity user);

    Optional<UserEntity> findByUsername(String username);

    List<UserEntity> listRegisteredUsers();

    List<UserEntity> listAllUsers();
}
